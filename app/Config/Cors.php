<?php

namespace Config;

use CodeIgniter\Config\BaseConfig;

/**
 * Cross-Origin Resource Sharing (CORS) Configuration
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS
 */
class Cors extends BaseConfig
{
    public array $default = [
        'allowedOrigins' => [],
        'allowedOriginsPatterns' => [],
        'supportsCredentials' => false,
        'allowedHeaders' => [
            'Content-Type',
            'Authorization',
            'X-Requested-With',
            'Accept',
            'Origin',
        ],
        'exposedHeaders' => ['Authorization'],
        'allowedMethods' => ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        'maxAge' => 7200,
    ];

    public function __construct()
    {
        parent::__construct();

        $origins = [
            'http://localhost:5173',
            'http://localhost:3000',
            'http://127.0.0.1:5173',
            'https://flowtrackhani.vercel.app',
        ];

        $frontendUrl = env('app.frontendURL');
        if (! empty($frontendUrl)) {
            $origins[] = rtrim((string) $frontendUrl, '/');
        }

        $deployConfigPath = ROOTPATH . 'config/deploy.json';
        if (is_file($deployConfigPath)) {
            $deploy = json_decode((string) file_get_contents($deployConfigPath), true);
            if (! empty($deploy['frontendUrl'])) {
                $origins[] = rtrim((string) $deploy['frontendUrl'], '/');
            }
        }

        $this->default['allowedOrigins'] = array_values(array_unique($origins));
        $this->default['allowedOriginsPatterns'] = [
            'https://.*\.vercel\.app',
        ];
    }
}
