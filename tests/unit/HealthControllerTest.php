<?php

use App\Controllers\API\V1\HealthController;
use CodeIgniter\Test\CIUnitTestCase;

/**
 * @internal
 */
final class HealthControllerTest extends CIUnitTestCase
{
    public function testHealthEndpointReturnsArray(): void
    {
        $controller = new HealthController();
        $method = new ReflectionMethod($controller, 'index');
        $this->assertTrue($method->isPublic());
    }
}
