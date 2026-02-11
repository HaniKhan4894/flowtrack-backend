<?php

namespace App\Controllers\API\V1;

use CodeIgniter\RESTful\ResourceController;
use App\Services\UserService;

class UserController extends ResourceController
{
    protected $userService;
    protected $format = 'json';

    public function __construct()
    {
        $this->userService = new UserService();
    }

    /**
     * GET /api/v1/users?role=admin&is_active=1&search=john&page=1&per_page=20
     */
    public function index()
    {
        try {
            // Get query parameters
            $filters = [
                'role' => $this->request->getGet('role'),
                'is_active' => $this->request->getGet('is_active'),
                'search' => $this->request->getGet('search'),
                'page' => $this->request->getGet('page') ?? 1,
                'per_page' => $this->request->getGet('per_page') ?? 20,
            ];

            // Remove null values
            $filters = array_filter($filters, fn($value) => $value !== null);

            $result = $this->userService->getUsers($filters);

            return $this->respond([
                'success' => true,
                'data' => $result['data'],
                'pagination' => $result['pagination']
            ]);

        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    /**
     * GET /api/v1/users/{id}
     */
    public function show($id = null)
    {
        try {
            $user = $this->userService->getUserById($id);

            if (!$user) {
                return $this->failNotFound('User not found');
            }

            // Remove sensitive data
            unset($user['password_hash']);

            return $this->respond([
                'success' => true,
                'data' => $user
            ]);

        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    /**
     * POST /api/v1/users
     */
    public function create()
    {
        try {
            $data = $this->request->getJSON(true);

            // Validation
            $rules = [
                'email' => 'required|valid_email|is_unique[users.email]',
                'password' => 'required|min_length[6]',
                'first_name' => 'required',
            ];

            if (!$this->validate($rules)) {
                return $this->failValidationErrors($this->validator->getErrors());
            }

            $user = $this->userService->createUser($data);

            return $this->respondCreated([
                'success' => true,
                'message' => 'User created successfully',
                'data' => $user
            ]);

        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    /**
     * PUT /api/v1/users/{id}
     */
    public function update($id = null)
    {
        try {
            $data = $this->request->getJSON(true);

            $updated = $this->userService->updateUser($id, $data);

            if (!$updated) {
                return $this->fail('Failed to update user', 400);
            }

            $user = $this->userService->getUserById($id);

            return $this->respond([
                'success' => true,
                'message' => 'User updated successfully',
                'data' => $user
            ]);

        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    /**
     * DELETE /api/v1/users/{id}
     */
    public function delete($id = null)
    {
        try {
            $deleted = $this->userService->deleteUser($id);

            if (!$deleted) {
                return $this->fail('Failed to delete user', 400);
            }

            return $this->respondDeleted([
                'success' => true,
                'message' => 'User deleted successfully'
            ]);

        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }
}
