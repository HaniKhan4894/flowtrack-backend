<?php

namespace App\Helpers;

/**
 * Map common exception messages / codes to HTTP status codes
 * so API clients get meaningful responses instead of a blanket 400.
 */
class HttpStatus
{
    public static function fromException(\Throwable $e, int $default = 400): int
    {
        $code = (int) $e->getCode();
        if ($code >= 400 && $code < 600) {
            return $code;
        }

        $msg = strtolower($e->getMessage());

        if (str_contains($msg, 'unauthorized') || str_contains($msg, 'unauthenticated')) {
            return 401;
        }
        if (
            str_contains($msg, 'forbidden')
            || str_contains($msg, 'permission')
            || str_contains($msg, 'not available on your')
            || str_contains($msg, 'upgrade')
        ) {
            return 403;
        }
        if (str_contains($msg, 'not found')) {
            return 404;
        }
        if (
            str_contains($msg, 'already exists')
            || str_contains($msg, 'already running')
            || str_contains($msg, 'conflict')
            || str_contains($msg, 'duplicate')
        ) {
            return 409;
        }
        if (
            str_contains($msg, 'invalid')
            || str_contains($msg, 'required')
            || str_contains($msg, 'must ')
            || str_contains($msg, 'validation')
        ) {
            return 422;
        }

        return $default;
    }
}
