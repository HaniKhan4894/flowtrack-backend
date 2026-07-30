<?php

namespace App\Controllers\API\V1;

use CodeIgniter\HTTP\ResponseInterface;
use CodeIgniter\RESTful\ResourceController;

/**
 * Shared plumbing for the platform (super-admin) API.
 *
 * Access is already gated by the `auth` + `superadmin` filters on the route
 * group, so controllers here only deal with input shaping and responses.
 */
abstract class AdminBaseController extends ResourceController
{
    protected $format = 'json';

    protected function adminId(): int
    {
        return (int) ($this->request->getServer('FLOWTRACK_USER_ID') ?? 0);
    }

    /**
     * JSON body, falling back to form-encoded input.
     *
     * @return array<string, mixed>
     */
    protected function payload(): array
    {
        $json = $this->request->getJSON(true);
        if (is_array($json) && $json !== []) {
            return $json;
        }

        return $this->request->getPost() ?: [];
    }

    /**
     * @return array<string, mixed>
     */
    protected function queryFilters(array $keys): array
    {
        $filters = [];
        foreach ($keys as $key) {
            $value = $this->request->getGet($key);
            if ($value !== null && $value !== '') {
                $filters[$key] = $value;
            }
        }

        return $filters;
    }

    protected function ok($data = null, ?string $message = null): ResponseInterface
    {
        $body = ['success' => true];
        if ($message !== null) {
            $body['message'] = $message;
        }
        if ($data !== null) {
            $body['data'] = $data;
        }

        return $this->respond($body);
    }

    /**
     * Wrap a service call so domain errors become clean 4xx responses.
     */
    protected function attempt(callable $handler, ?string $message = null): ResponseInterface
    {
        try {
            $result = $handler();
        } catch (\RuntimeException | \InvalidArgumentException $e) {
            return $this->fail($e->getMessage(), 400);
        } catch (\Throwable $e) {
            log_message('error', 'Platform admin action failed: ' . $e->getMessage());

            return $this->fail('Something went wrong. Please try again.', 500);
        }

        return $this->ok($result, $message);
    }
}
