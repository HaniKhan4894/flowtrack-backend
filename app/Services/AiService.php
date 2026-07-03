<?php

namespace App\Services;

use Config\Ai as AiConfig;

/**
 * Central AI engine. Talks to an OpenAI-compatible Chat Completions API and
 * exposes higher-level product capabilities (natural-language analytics,
 * narrative summaries) grounded in FlowTrack's own data.
 *
 * Key resolution is per-organization (BYOK): each org supplies its own OpenAI
 * key via the `openai` integration, so AI usage is billed to them. The .env
 * `OPENAI_API_KEY` is only an optional platform-wide fallback.
 */
class AiService
{
    public const PROVIDER = 'openai';

    /** @var array{enabled:bool, api_key:string, base_url:string, model:string, max_tokens:int, temperature:float, timeout:int} */
    protected array $envCfg;
    protected IntegrationService $integrations;

    public function __construct()
    {
        $this->envCfg = (new AiConfig())->settings();
        $this->integrations = new IntegrationService();
    }

    /**
     * Effective config for an organization: prefer the org's own key, else the
     * platform env key.
     *
     * @return array{api_key:string, base_url:string, model:string, max_tokens:int, temperature:float, timeout:int, source:string}
     */
    public function resolveConfig(int $organizationId): array
    {
        $cfg = $this->envCfg;
        $cfg['source'] = 'none';

        $org = $this->integrations->get($organizationId, self::PROVIDER);
        if ($org && $org['is_enabled'] && !empty($org['secrets']['api_key'])) {
            $cfg['api_key']  = (string) $org['secrets']['api_key'];
            $cfg['model']    = (string) ($org['settings']['model'] ?? $cfg['model']);
            $cfg['base_url'] = rtrim((string) ($org['settings']['base_url'] ?? $cfg['base_url']), '/');
            $cfg['source']   = 'organization';
        } elseif ($this->envCfg['enabled'] && $this->envCfg['api_key'] !== '') {
            $cfg['source'] = 'platform';
        } else {
            $cfg['api_key'] = '';
        }

        return $cfg;
    }

    public function isEnabled(int $organizationId): bool
    {
        return $this->resolveConfig($organizationId)['api_key'] !== '';
    }

    /**
     * @return array{enabled:bool, source:string, model:string}
     */
    public function statusFor(int $organizationId): array
    {
        $cfg = $this->resolveConfig($organizationId);
        return [
            'enabled' => $cfg['api_key'] !== '',
            'source'  => $cfg['source'],
            'model'   => $cfg['model'],
        ];
    }

    /**
     * "Ask FlowTrack" — answer a natural-language question using the org's
     * real metrics as grounding context.
     *
     * @return array{answer:string, period:array, model:string}
     */
    public function ask(int $organizationId, int $userId, string $question): array
    {
        $cfg = $this->requireConfig($organizationId);

        $question = trim($question);
        if ($question === '') {
            throw new \InvalidArgumentException('Please enter a question.');
        }
        if (mb_strlen($question) > 500) {
            $question = mb_substr($question, 0, 500);
        }

        $context = $this->buildOrgContext($organizationId, $userId);

        $system = <<<SYS
You are FlowTrack's analytics assistant. FlowTrack is a team time-tracking and
productivity platform. Answer the user's question using ONLY the JSON DATA
provided. Be concise and specific, cite concrete numbers (hours, percentages,
names) from the data, and format with short paragraphs or bullet points.
If the data does not contain the answer, say so plainly and suggest what to
track instead. Never invent figures that are not in the data. Time values are
hours unless stated otherwise.
SYS;

        $user = "DATA:\n" . json_encode($context, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES)
            . "\n\nQUESTION:\n" . $question;

        $answer = $this->chat($cfg, [
            ['role' => 'system', 'content' => $system],
            ['role' => 'user', 'content' => $user],
        ]);

        return [
            'answer' => $answer,
            'period' => $context['period'],
            'model'  => $cfg['model'],
        ];
    }

    /**
     * Turn the weekly manager summary into an executive narrative.
     *
     * @return array{narrative:string, summary:array, model:string}
     */
    public function weeklyNarrative(int $organizationId, int $userId): array
    {
        $cfg = $this->requireConfig($organizationId);

        $summary = (new InsightsService())->getWeeklyManagerSummary($organizationId, $userId);

        $system = 'You are FlowTrack\'s executive assistant. Write a crisp weekly '
            . 'team performance narrative (120-180 words) for a manager, based ONLY on '
            . 'the JSON data. Lead with the headline, mention hours & productivity trend, '
            . 'call out top contributors and biggest distractions, and end with one '
            . 'actionable recommendation. Use a confident, human tone. No preamble.';

        $narrative = $this->chat($cfg, [
            ['role' => 'system', 'content' => $system],
            ['role' => 'user', 'content' => json_encode($summary, JSON_UNESCAPED_SLASHES)],
        ]);

        return [
            'narrative' => $narrative,
            'summary'   => $summary,
            'model'     => $cfg['model'],
        ];
    }

    /**
     * Assemble a compact, LLM-friendly snapshot of the organization.
     */
    protected function buildOrgContext(int $organizationId, int $userId): array
    {
        $insights = new InsightsService();
        $weekly = $insights->getWeeklyManagerSummary($organizationId, $userId);

        $context = [
            'organization_id' => $organizationId,
            'period'          => $weekly['period'] ?? null,
            'comparison'      => $weekly['comparison_period'] ?? null,
            'team_hours_7d'   => $weekly['total_hours'] ?? 0,
            'hours_delta'     => $weekly['hours_delta'] ?? 0,
            'productive_percent' => $weekly['productive_percent'] ?? 0,
            'productive_delta'   => $weekly['productive_delta'] ?? 0,
            'highlights'      => $weekly['highlights'] ?? [],
            'top_members'     => $weekly['top_members'] ?? [],
            'top_distractions' => $weekly['top_distractions'] ?? [],
        ];

        // Enrich with a 30-day project breakdown when available.
        try {
            $end = date('Y-m-d');
            $start = date('Y-m-d', strtotime('-29 days'));
            $benchmarks = $insights->getBenchmarks($organizationId, $start, $end);
            $context['project_breakdown_30d'] = array_slice($benchmarks['by_project'] ?? [], 0, 10);
        } catch (\Throwable $e) {
            // Non-fatal: context is still useful without it.
        }

        return $context;
    }

    /**
     * Low-level Chat Completions call. Returns the assistant message content.
     *
     * @param array{api_key:string, base_url:string, model:string, max_tokens:int, temperature:float, timeout:int} $cfg
     * @param array<int, array{role:string, content:string}> $messages
     */
    public function chat(array $cfg, array $messages, array $options = []): string
    {
        if (($cfg['api_key'] ?? '') === '') {
            throw new \RuntimeException('AI is not configured for this organization.');
        }

        $payload = [
            'model'       => $options['model'] ?? $cfg['model'],
            'messages'    => $messages,
            'temperature' => $options['temperature'] ?? $cfg['temperature'],
            'max_tokens'  => $options['max_tokens'] ?? $cfg['max_tokens'],
        ];

        $client = \Config\Services::curlrequest([
            'timeout'     => $cfg['timeout'] ?? 45,
            'http_errors' => false,
        ]);

        try {
            $response = $client->post(rtrim($cfg['base_url'], '/') . '/chat/completions', [
                'headers' => [
                    'Authorization' => 'Bearer ' . $cfg['api_key'],
                    'Content-Type'  => 'application/json',
                ],
                'body' => json_encode($payload),
            ]);
        } catch (\Throwable $e) {
            log_message('error', 'AI request failed: ' . $e->getMessage());
            throw new \RuntimeException('The AI service is unreachable right now. Please try again.');
        }

        $status = $response->getStatusCode();
        $body = json_decode((string) $response->getBody(), true);

        if ($status >= 400 || !is_array($body)) {
            $detail = is_array($body) ? ($body['error']['message'] ?? null) : null;
            log_message('error', 'AI API error (' . $status . '): ' . (string) $response->getBody());
            throw new \RuntimeException($detail ? ('AI error: ' . $detail) : 'The AI service returned an error.');
        }

        $content = $body['choices'][0]['message']['content'] ?? '';
        $content = is_string($content) ? trim($content) : '';

        if ($content === '') {
            throw new \RuntimeException('The AI service returned an empty response.');
        }

        return $content;
    }

    /**
     * Run a chat completion using an organization's resolved AI config.
     *
     * @param array<int, array{role:string, content:string}> $messages
     */
    public function chatForOrg(int $organizationId, array $messages, array $options = []): string
    {
        return $this->chat($this->requireConfig($organizationId), $messages, $options);
    }

    /**
     * @return array{api_key:string, base_url:string, model:string, max_tokens:int, temperature:float, timeout:int, source:string}
     */
    private function requireConfig(int $organizationId): array
    {
        $cfg = $this->resolveConfig($organizationId);
        if ($cfg['api_key'] === '') {
            throw new \RuntimeException('AI features are not configured. Add your OpenAI API key in Settings → Integrations.');
        }
        return $cfg;
    }
}
