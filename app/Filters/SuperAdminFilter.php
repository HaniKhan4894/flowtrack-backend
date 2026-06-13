<?php

namespace App\Filters;

use CodeIgniter\Filters\FilterInterface;
use CodeIgniter\HTTP\RequestInterface;
use CodeIgniter\HTTP\ResponseInterface;
use App\Models\UserModel;

class SuperAdminFilter implements FilterInterface
{
    public function before(RequestInterface $request, $arguments = null)
    {
        $userId = (int) ($request->getServer('FLOWTRACK_USER_ID') ?? 0);
        if (!$userId) {
            return service('response')->setJSON([
                'status' => 401,
                'error' => 401,
                'messages' => ['error' => 'Unauthorized'],
            ])->setStatusCode(401);
        }

        $user = (new UserModel())->find($userId);
        if (!$user || empty($user['is_super_admin'])) {
            return service('response')->setJSON([
                'status' => 403,
                'error' => 403,
                'messages' => ['error' => 'Super admin access required'],
            ])->setStatusCode(403);
        }

        return null;
    }

    public function after(RequestInterface $request, ResponseInterface $response, $arguments = null)
    {
    }
}
