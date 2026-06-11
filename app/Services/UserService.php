<?php

namespace App\Services;

use App\Models\UserModel;
use CodeIgniter\Database\Exceptions\DatabaseException;

class UserService
{
    protected $userModel;
    protected $db;

    public function __construct()
    {
        $this->userModel = new UserModel();
        $this->db = \Config\Database::connect();
    }

    /**
     * Get user by ID
     */
    public function getUserById(int $id): ?array
    {
        return $this->userModel->find($id);
    }

    /**
     * Get user by UUID
     */
    public function getUserByUUID(string $uuid): ?array
    {
        return $this->userModel->where('uuid', $uuid)->first();
    }

    /**
     * Get user by email
     */
    public function getUserByEmail(string $email): ?array
    {
        return $this->userModel->where('email', $email)->first();
    }

    /**
     * Create new user
     */
    public function createUser(array $data): array
    {
        // Hash password if provided
        if (isset($data['password'])) {
            $data['password_hash'] = password_hash($data['password'], PASSWORD_BCRYPT);
            unset($data['password']);
        }

        $userId = $this->userModel->insert($data);

        if (!$userId) {
            throw new \Exception('Failed to create user: ' . json_encode($this->userModel->errors()));
        }

        return $this->getUserById($userId);
    }

    /**
     * Update user
     */
    public function updateUser(int $id, array $data): bool
    {
        // Remove fields that shouldn't be updated
        unset($data['id'], $data['uuid'], $data['password_hash'], $data['created_at']);

        // Hash password if being updated
        if (isset($data['password'])) {
            $data['password_hash'] = password_hash($data['password'], PASSWORD_BCRYPT);
            unset($data['password']);
        }

        return $this->userModel->update($id, $data);
    }

    /**
     * Delete user (soft delete)
     */
    public function deleteUser(int $id): bool
    {
        return $this->userModel->delete($id);
    }

    /**
     * Get users with filters (query params)
     */
    public function getUsers(array $filters = []): array
    {
        $builder = $this->userModel->builder()->select('users.*');

        if (!empty($filters['organization_id'])) {
            $builder->join('organization_members', 'organization_members.user_id = users.id');
            $builder->where('organization_members.organization_id', $filters['organization_id']);
            $builder->groupBy('users.id');
        }

        // Apply filters
        if (isset($filters['role'])) {
            $builder->where('role', $filters['role']);
        }

        if (isset($filters['is_active'])) {
            $builder->where('is_active', $filters['is_active']);
        }

        if (isset($filters['search'])) {
            $builder->groupStart()
                ->like('first_name', $filters['search'])
                ->orLike('last_name', $filters['search'])
                ->orLike('email', $filters['search'])
                ->groupEnd();
        }

        // Pagination
        $page = $filters['page'] ?? 1;
        $perPage = $filters['per_page'] ?? 20;
        $offset = ($page - 1) * $perPage;

        $total = $builder->countAllResults(false);
        $users = $builder->limit($perPage, $offset)->get()->getResultArray();

        return [
            'data' => $users,
            'pagination' => [
                'current_page' => (int)$page,
                'per_page' => (int)$perPage,
                'total' => $total,
                'total_pages' => ceil($total / $perPage),
                'has_more' => $page < ceil($total / $perPage)
            ]
        ];
    }
}
