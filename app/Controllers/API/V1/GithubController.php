<?php

namespace App\Controllers\API\V1;

use App\Models\TimeEntryGithubLinkModel;
use App\Services\GitHubService;
use App\Services\TimeEntryService;
use CodeIgniter\RESTful\ResourceController;

/**
 * Phase 4 — GitHub commits/PRs linked to tracked time.
 *
 * Uses the organization's connected `github` integration to surface the current
 * user's recent development work and turn any commit/PR into a time entry.
 */
class GithubController extends ResourceController
{
    protected $format = 'json';
    protected GitHubService $github;

    public function __construct()
    {
        $this->github = new GitHubService();
    }

    /**
     * GET /api/v1/integrations/github/activity?days=7
     */
    public function activity()
    {
        try {
            $orgId = $this->orgId();

            if (!$this->github->isConnected($orgId)) {
                return $this->respond([
                    'success' => true,
                    'data' => ['connected' => false, 'login' => null, 'commits' => [], 'pull_requests' => []],
                ]);
            }

            $days = (int) ($this->request->getGet('days') ?? 7);
            $days = max(1, min(30, $days));
            $prPage = max(1, (int) ($this->request->getGet('pr_page') ?? 1));
            $commitPage = max(1, (int) ($this->request->getGet('commit_page') ?? 1));
            $perPage = max(1, min(50, (int) ($this->request->getGet('per_page') ?? 20)));

            $result = $this->github->recentActivity($orgId, $days, $prPage, $commitPage, $perPage);
            $result['connected'] = true;

            return $this->respond(['success' => true, 'data' => $result]);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    /**
     * POST /api/v1/integrations/github/log-time
     * Body: { type, repo, external_id, title, url, authored_at, project_id?, duration_minutes?, description? }
     * Creates a manual time entry from a commit/PR and records the link.
     */
    public function logTime()
    {
        try {
            [$orgId, $userId] = $this->context();
            $body = $this->request->getJSON(true) ?? [];

            $type = ($body['type'] ?? 'commit') === 'pull_request' ? 'pull_request' : 'commit';
            $title = trim((string) ($body['title'] ?? ''));
            if ($title === '') {
                return $this->fail('A commit or pull request title is required.', 400);
            }

            $minutes = (int) ($body['duration_minutes'] ?? 30);
            $minutes = max(1, min(600, $minutes));

            $endTs = !empty($body['authored_at']) ? strtotime((string) $body['authored_at']) : time();
            if ($endTs === false) {
                $endTs = time();
            }
            $startTs = $endTs - ($minutes * 60);

            $repo = (string) ($body['repo'] ?? '');
            $prefix = $type === 'pull_request' ? 'PR' : 'Commit';
            $description = trim((string) ($body['description'] ?? ''));
            if ($description === '') {
                $description = $repo !== '' ? sprintf('[%s] %s: %s', $repo, $prefix, $title) : sprintf('%s: %s', $prefix, $title);
            }

            $entry = (new TimeEntryService())->createManualEntry($userId, $orgId, [
                'project_id'  => isset($body['project_id']) && $body['project_id'] ? (int) $body['project_id'] : null,
                'description' => mb_substr($description, 0, 1000),
                'started_at'  => date('Y-m-d H:i:s', $startTs),
                'ended_at'    => date('Y-m-d H:i:s', $endTs),
                'is_billable' => (bool) ($body['is_billable'] ?? true),
            ]);

            (new TimeEntryGithubLinkModel())->insert([
                'organization_id' => $orgId,
                'time_entry_id'   => (int) $entry['id'],
                'user_id'         => $userId,
                'type'            => $type,
                'repo'            => $repo !== '' ? mb_substr($repo, 0, 191) : null,
                'external_id'     => isset($body['external_id']) ? mb_substr((string) $body['external_id'], 0, 191) : null,
                'title'           => mb_substr($title, 0, 500),
                'url'             => isset($body['url']) ? mb_substr((string) $body['url'], 0, 500) : null,
                'authored_at'     => date('Y-m-d H:i:s', $endTs),
            ]);

            return $this->respondCreated(['success' => true, 'data' => $entry]);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    /**
     * GET /api/v1/integrations/github/repos
     */
    public function repos()
    {
        try {
            $orgId = $this->orgId();
            if (!$this->github->isConnected($orgId)) {
                return $this->respond(['success' => true, 'data' => ['connected' => false, 'repos' => []]]);
            }
            $max = (int) ($this->request->getGet('max') ?? 30);
            return $this->respond([
                'success' => true,
                'data' => ['connected' => true, 'repos' => $this->github->listRepos($orgId, $max)],
            ]);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    /**
     * GET /api/v1/integrations/github/pulls/(:segment)/(:segment)/(:num)
     */
    public function pullRequest(string $owner, string $repo, int $number)
    {
        try {
            $orgId = $this->orgId();
            if (!$this->github->isConnected($orgId)) {
                return $this->fail('GitHub is not connected.', 400);
            }
            return $this->respond([
                'success' => true,
                'data' => $this->github->getPullRequest($orgId, $owner, $repo, $number),
            ]);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    /**
     * POST /api/v1/integrations/github/pulls/(:segment)/(:segment)/(:num)/comment
     */
    public function pullComment(string $owner, string $repo, int $number)
    {
        try {
            $orgId = $this->orgId();
            $body = $this->request->getJSON(true) ?? [];
            $text = trim((string) ($body['body'] ?? ''));
            if ($text === '') {
                return $this->fail('Comment body is required.', 400);
            }
            $comment = $this->github->addPullRequestComment($orgId, $owner, $repo, $number, $text);
            return $this->respondCreated(['success' => true, 'data' => $comment]);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    /**
     * POST /api/v1/integrations/github/pulls/(:segment)/(:segment)/(:num)/merge
     */
    public function pullMerge(string $owner, string $repo, int $number)
    {
        try {
            $orgId = $this->orgId();
            $result = $this->github->mergePullRequest($orgId, $owner, $repo, $number);
            return $this->respond(['success' => true, 'data' => $result]);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    /**
     * POST /api/v1/integrations/github/pulls/(:segment)/(:segment)/(:num)/state
     */
    public function pullState(string $owner, string $repo, int $number)
    {
        try {
            $orgId = $this->orgId();
            $body = $this->request->getJSON(true) ?? [];
            $state = trim((string) ($body['state'] ?? 'closed'));
            $result = $this->github->updatePullRequest($orgId, $owner, $repo, $number, $state);
            return $this->respond(['success' => true, 'data' => $result]);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    private function orgId(): int
    {
        $orgId = (int) ($this->request->getServer('FLOWTRACK_ORGANIZATION_ID') ?? 0);
        if (!$orgId) {
            throw new \RuntimeException('Unauthorized');
        }
        return $orgId;
    }

    private function context(): array
    {
        $orgId = $this->orgId();
        $userId = (int) ($this->request->getServer('FLOWTRACK_USER_ID') ?? 0);
        if (!$userId) {
            throw new \RuntimeException('Unauthorized');
        }
        return [$orgId, $userId];
    }
}
