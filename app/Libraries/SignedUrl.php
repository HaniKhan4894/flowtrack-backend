<?php

namespace App\Libraries;

/**
 * Short-lived HMAC URLs so the browser can load private media via <img src>
 * without sending a Bearer header (and so HTTP cache / 304 can work).
 */
class SignedUrl
{
    public const DEFAULT_TTL_SECONDS = 3600;

    public static function secret(): string
    {
        $key = (string) (env('encryption.key') ?: env('app.encryption.key') ?: '');
        if ($key !== '') {
            return $key;
        }

        // Last resort so local/dev still works if encryption key is unset.
        return (string) (config('Encryption')->key ?: 'flowtrack-signed-url-dev-key');
    }

    /**
     * @return array{exp:int,sig:string}
     */
    public static function sign(string $resource, int $id, string $mode, int $ttlSeconds = self::DEFAULT_TTL_SECONDS): array
    {
        $exp = time() + max(60, $ttlSeconds);
        $sig = self::signature($resource, $id, $mode, $exp);

        return ['exp' => $exp, 'sig' => $sig];
    }

    public static function isValid(string $resource, int $id, string $mode, ?string $exp, ?string $sig): bool
    {
        if ($exp === null || $sig === null || $exp === '' || $sig === '') {
            return false;
        }

        if (!ctype_digit((string) $exp)) {
            return false;
        }

        $expInt = (int) $exp;
        if ($expInt < time()) {
            return false;
        }

        $expected = self::signature($resource, $id, $mode, $expInt);

        return hash_equals($expected, (string) $sig);
    }

    public static function signature(string $resource, int $id, string $mode, int $exp): string
    {
        $payload = strtolower($resource) . '|' . $id . '|' . strtolower($mode) . '|' . $exp;

        return hash_hmac('sha256', $payload, self::secret());
    }

    /**
     * Absolute API URL for a screenshot thumb/view with exp+sig query params.
     */
    public static function screenshotUrl(int $screenshotId, string $mode, int $ttlSeconds = self::DEFAULT_TTL_SECONDS): string
    {
        $mode = $mode === 'view' ? 'view' : 'thumb';
        $parts = self::sign('screenshot', $screenshotId, $mode, $ttlSeconds);
        $base = rtrim((string) (env('app.baseURL') ?: config('App')->baseURL), '/');

        return sprintf(
            '%s/api/v1/screenshots/%s/%d?exp=%d&sig=%s',
            $base,
            $mode,
            $screenshotId,
            $parts['exp'],
            $parts['sig']
        );
    }
}
