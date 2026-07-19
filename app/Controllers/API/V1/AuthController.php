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
                'password' => 'required|min_length[8]',
                'first_name' => 'required',
            ];

            if (!$this->validate($rules)) {
                return $this->failValidationErrors($this->validator->getErrors());
            }

            $result = $this->authService->register($data);

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
            $data = $this->parseJsonBody();

            // Validation
            $rules = [
                'email' => 'required|valid_email',
                'password' => 'required',
            ];

            if (!$this->validate($rules, $data)) {
                return $this->failValidationErrors($this->validator->getErrors());
            }

            $result = $this->authService->login(
                $data['email'],
                $data['password'],
                $data['totp_code'] ?? null,
                $this->request->getUserAgent()->getAgentString(),
                $this->request->getIPAddress()
            );

            return $this->respond([
                'success' => true,
                'message' => 'Login successful',
                'data' => $result
            ]);

        } catch (\InvalidArgumentException $e) {
            return $this->fail($e->getMessage(), 400);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 401);
        }
    }

    /**
     * @return array<string, mixed>
     */
    private function parseJsonBody(): array
    {
        try {
            $data = $this->request->getJSON(true);
            if (is_array($data)) {
                return $data;
            }
        } catch (\Throwable $e) {
            // Body was not valid JSON — fall through to form/raw parsing.
        }

        $post = $this->request->getPost();
        if (is_array($post) && $post !== []) {
            return $post;
        }

        $raw = trim((string) $this->request->getBody());
        if ($raw !== '') {
            $decoded = json_decode($raw, true);
            if (json_last_error() === JSON_ERROR_NONE && is_array($decoded)) {
                return $decoded;
            }
        }

        throw new \InvalidArgumentException(
            'Request body must be valid JSON. Use Content-Type: application/json with {"email":"you@example.com","password":"your-password"}.'
        );
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

            $result = $this->authService->refreshToken(
                $data['refresh_token'],
                $this->request->getUserAgent()->getAgentString(),
                $this->request->getIPAddress()
            );

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
        try {
            $data = $this->request->getJSON(true) ?? [];
            $this->authService->logout($data['refresh_token'] ?? null);
        } catch (\Exception $e) {
            // Ignore logout errors
        }

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
            $userId = (int)($request->getServer('FLOWTRACK_USER_ID') ?? 0);

            if (!$userId) {
                return $this->fail('Unauthorized', 401);
            }

            $user = $this->authService->buildAuthProfile($userId);

            if (!$user) {
                return $this->fail('User not found', 404);
            }

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
                'password' => 'required|min_length[8]',
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

    /**
     * POST /api/v1/auth/verify-email
     */
    public function verifyEmail()
    {
        try {
            $data = $this->request->getJSON(true);

            if (empty($data['token'])) {
                return $this->fail('Verification token is required', 400);
            }

            $verificationService = new \App\Services\EmailVerificationService();
            $verificationService->verifyEmail($data['token']);

            return $this->respond([
                'success' => true,
                'message' => 'Email verified successfully. You can now sign in.',
            ]);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    /**
     * POST /api/v1/auth/resend-verification
     */
    public function resendVerification()
    {
        try {
            $data = $this->request->getJSON(true);

            if (empty($data['email'])) {
                return $this->fail('Email is required', 400);
            }

            $verificationService = new \App\Services\EmailVerificationService();
            $verificationService->resendVerificationEmail($data['email']);

            return $this->respond([
                'success' => true,
                'message' => 'If the account exists and is not verified, a new verification email has been sent.',
            ]);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    /**
     * POST /api/v1/auth/change-password
     */
    public function changePassword()
    {
        try {
            $userId = (int)($this->request->getServer('FLOWTRACK_USER_ID') ?? 0);
            if (!$userId) {
                return $this->fail('Unauthorized', 401);
            }

            $data = $this->request->getJSON(true);
            $rules = [
                'current_password' => 'required',
                'new_password' => 'required|min_length[8]',
                'confirm_password' => 'required|matches[new_password]',
            ];

            if (!$this->validate($rules)) {
                return $this->failValidationErrors($this->validator->getErrors());
            }

            $userService = new \App\Services\UserService();
            $userService->changePassword($userId, $data['current_password'], $data['new_password']);

            return $this->respond([
                'success' => true,
                'message' => 'Password changed successfully',
            ]);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    public function setupTwoFactor()
    {
        try {
            $userId = (int)($this->request->getServer('FLOWTRACK_USER_ID') ?? 0);
            if (!$userId) {
                return $this->fail('Unauthorized', 401);
            }

            $result = $this->authService->setupTwoFactor($userId);

            return $this->respond(['success' => true, 'data' => $result]);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    public function verifyTwoFactor()
    {
        try {
            $userId = (int)($this->request->getServer('FLOWTRACK_USER_ID') ?? 0);
            if (!$userId) {
                return $this->fail('Unauthorized', 401);
            }

            $data = $this->request->getJSON(true);
            if (empty($data['code'])) {
                return $this->fail('code is required', 400);
            }

            $this->authService->verifyTwoFactor($userId, $data['code']);

            return $this->respond(['success' => true, 'message' => 'Two-factor authentication enabled']);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    public function disableTwoFactor()
    {
        try {
            $userId = (int)($this->request->getServer('FLOWTRACK_USER_ID') ?? 0);
            if (!$userId) {
                return $this->fail('Unauthorized', 401);
            }

            $data = $this->request->getJSON(true);
            if (empty($data['password']) || empty($data['code'])) {
                return $this->fail('password and code are required', 400);
            }

            $this->authService->disableTwoFactor($userId, $data['password'], $data['code']);

            return $this->respond(['success' => true, 'message' => 'Two-factor authentication disabled']);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    public function sessions()
    {
        try {
            $userId = (int)($this->request->getServer('FLOWTRACK_USER_ID') ?? 0);
            if (!$userId) {
                return $this->fail('Unauthorized', 401);
            }

            return $this->respond([
                'success' => true,
                'data' => $this->authService->listSessions($userId),
            ]);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    public function revokeSession($id = null)
    {
        try {
            $userId = (int)($this->request->getServer('FLOWTRACK_USER_ID') ?? 0);
            if (!$userId) {
                return $this->fail('Unauthorized', 401);
            }

            $this->authService->revokeSession($userId, (int) $id);

            return $this->respond(['success' => true, 'message' => 'Session revoked']);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }
}
