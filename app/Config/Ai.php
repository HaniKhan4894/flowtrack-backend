<?php

namespace Config;

use CodeIgniter\Config\BaseConfig;

/**
 * AI engine configuration. Defaults to OpenAI, but `base_url` allows any
 * OpenAI-compatible Chat Completions endpoint (Azure OpenAI, local proxies…).
 */
class Ai extends BaseConfig
{
    /**
     * @return array{enabled:bool, api_key:string, base_url:string, model:string, max_tokens:int, temperature:float, timeout:int}
     */
    public function settings(): array
    {
        return [
            'enabled'     => filter_var(env('AI_ENABLED', true), FILTER_VALIDATE_BOOLEAN),
            'api_key'     => (string) (env('OPENAI_API_KEY') ?: ''),
            'base_url'    => rtrim((string) (env('AI_BASE_URL') ?: 'https://api.openai.com/v1'), '/'),
            'model'       => (string) (env('AI_MODEL') ?: 'gpt-4o-mini'),
            'max_tokens'  => (int) (env('AI_MAX_TOKENS') ?: 800),
            'temperature' => (float) (env('AI_TEMPERATURE') ?: 0.3),
            'timeout'     => (int) (env('AI_TIMEOUT') ?: 45),
        ];
    }
}
