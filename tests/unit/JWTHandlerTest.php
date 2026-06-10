<?php

use App\Libraries\JWTHandler;
use CodeIgniter\Test\CIUnitTestCase;

/**
 * @internal
 */
final class JWTHandlerTest extends CIUnitTestCase
{
    public function testGenerateAndVerifyAccessToken(): void
    {
        $secret = 'test-secret-key-should-be-at-least-32-bytes';
        putenv('JWT_SECRET_KEY=' . $secret);
        $_ENV['JWT_SECRET_KEY'] = $secret;
        $_SERVER['JWT_SECRET_KEY'] = $secret;

        $handler = new JWTHandler();
        $token = $handler->generateAccessToken([
            'user_id' => 123,
            'email' => 'user@example.com',
        ], 300);

        $this->assertIsString($token);
        $data = $handler->getUserFromToken($token);
        $this->assertSame(123, $data['user_id']);
        $this->assertSame('user@example.com', $data['email']);
    }

    public function testRefreshTokenContainsType(): void
    {
        $secret = 'test-secret-key-should-be-at-least-32-bytes';
        putenv('JWT_SECRET_KEY=' . $secret);
        $_ENV['JWT_SECRET_KEY'] = $secret;
        $_SERVER['JWT_SECRET_KEY'] = $secret;

        $handler = new JWTHandler();
        $refresh = $handler->generateRefreshToken(['user_id' => 77], 300);
        $decoded = $handler->verifyToken($refresh);

        $this->assertNotNull($decoded);
        $this->assertSame('refresh', $decoded->type ?? null);
    }
}
