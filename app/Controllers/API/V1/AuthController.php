<?php

namespace App\Controllers\API\V1;

use CodeIgniter\RESTful\ResourceController;
use App\Services\AuthService;

class AuthController extends ResourceController
{
    protected $authService;
    protected $format = 'json';

    public function __construct()
    {
        $this->authService = new AuthService();
    }

    /**
     * POST /api/v1/auth/register
     */
    public function register()
    {
        try {
            $data = $this->request->getJSON(true);
            $invitationToken = $data['invitation_token'] ?? null;

            // Validation
            $rules = [
                'email' => 'required|valid_email',
                'password' => 'required|min_length[6]',
                'first_name' => 'required',
            ];

            if (!$this->validate($rules)) {
                return $this->failValidationErrors($this->validator->getErrors());
            }

            $result = $this->authService->register($data);

            // If invitation token exists, add user to organization
            if ($invitationToken && isset($result['id'])) {
                $organizationService = new \App\Services\OrganizationService();
                $invitationModel = new \App\Models\InvitationModel();
                
                $invite = $invitationModel->where('token', $invitationToken)
                                        ->where('expires_at >=', date('Y-m-d H:i:s'))
                                        ->first();
                                        
                if ($invite) {
                    try {
                         $organizationService->addMember(
                             $invite['organization_id'],
                             $result['id'],
                             $invite['role'],
                             null
                         );
                         // Delete invitation after use
                         $invitationModel->delete($invite['id']);
                    } catch (\Exception $ex) {
                        // Log error but don't fail registration
                        log_message('error', 'Failed to process invitation: ' . $ex->getMessage());
                    }
                }
            }

            return $this->respondCreated([
                'success' => true,
                'message' => 'User registered successfully',
                'data' => $result
            ]);

        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    /**
     * POST /api/v1/auth/login
     */
    public function login()
    {
        try {
            $data = $this->request->getJSON(true);

            // Validation
            $rules = [
                'email' => 'required|valid_email',
                'password' => 'required',
            ];

            if (!$this->validate($rules)) {
                return $this->failValidationErrors($this->validator->getErrors());
            }

            $result = $this->authService->login($data['email'], $data['password']);

            return $this->respond([
                'success' => true,
                'message' => 'Login successful',
                'data' => $result
            ]);

        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 401);
        }
    }

    /**
     * POST /api/v1/auth/refresh
     */
    public function refresh()
    {
        try {
            $data = $this->request->getJSON(true);

            if (!isset($data['refresh_token'])) {
                return $this->fail('Refresh token is required', 400);
            }

            $result = $this->authService->refreshToken($data['refresh_token']);

            return $this->respond([
                'success' => true,
                'message' => 'Token refreshed successfully',
                'data' => $result
            ]);

        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 401);
        }
    }

    /**
     * POST /api/v1/auth/logout
     */
    public function logout()
    {
        return $this->respond([
            'success' => true,
            'message' => 'Logged out successfully'
        ]);
    }

    /**
     * GET /api/v1/auth/me
     * Requires: Authorization header with JWT token
     */
    public function me()
    {
        try {
            // User data attached by AuthFilter
            /** @var \CodeIgniter\HTTP\IncomingRequest $request */
            $request = $this->request;
            $userId = $request->user_id ?? null;

            if (!$userId) {
                return $this->fail('Unauthorized', 401);
            }

            $user = (new \App\Services\UserService())->getUserById($userId);

            if (!$user) {
                return $this->fail('User not found', 404);
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
     * POST /api/v1/auth/forgot-password
     */
    public function forgotPassword()
    {
        try {
            $data = $this->request->getJSON(true);

            if (!isset($data['email'])) {
                return $this->fail('Email is required', 400);
            }

            $passwordResetService = new \App\Services\PasswordResetService();
            $passwordResetService->sendResetEmail($data['email']);

            return $this->respond([
                'success' => true,
                'message' => 'If the email exists, a password reset link has been sent'
            ]);

        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    /**
     * POST /api/v1/auth/reset-password
     */
    public function resetPassword()
    {
        try {
            $data = $this->request->getJSON(true);

            $rules = [
                'token' => 'required',
                'password' => 'required|min_length[6]',
            ];

            if (!$this->validate($rules)) {
                return $this->failValidationErrors($this->validator->getErrors());
            }

            $passwordResetService = new \App\Services\PasswordResetService();
            $passwordResetService->resetPassword($data['token'], $data['password']);

            return $this->respond([
                'success' => true,
                'message' => 'Password has been reset successfully'
            ]);

        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }
}
