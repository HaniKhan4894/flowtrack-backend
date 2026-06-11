<?php

use CodeIgniter\Router\RouteCollection;

/**
 * @var RouteCollection $routes
 */

// Default route
$routes->get('/', 'Home::index');

// CORS preflight: return 204 for OPTIONS requests (including nested API paths)
$routes->options('api/v1/(:any)', 'App\Controllers\API\V1\CorsController::preflight');
$routes->options('api/v1/(:any)/(:any)', 'App\Controllers\API\V1\CorsController::preflight');
$routes->options('api/v1/(:any)/(:any)/(:any)', 'App\Controllers\API\V1\CorsController::preflight');
$routes->options('api/v1/(:any)/(:any)/(:any)/(:any)', 'App\Controllers\API\V1\CorsController::preflight');
$routes->options('api/v1/(:any)/(:any)/(:any)/(:any)/(:any)', 'App\Controllers\API\V1\CorsController::preflight');

/*
 * --------------------------------------------------------------------
 * API Routes - Version 1
 * --------------------------------------------------------------------
 * All API routes use query parameters, not URI segments
 * Example: /api/v1/users?role=admin&page=1
 */

$routes->group('api/v1', ['namespace' => 'App\Controllers\API\V1'], function ($routes) {
    $routes->get('health', 'HealthController::index');

    // Public Authentication Routes (No Auth Required)
    $routes->post('auth/register', 'AuthController::register');
    $routes->post('auth/login', 'AuthController::login');
    $routes->post('auth/refresh', 'AuthController::refresh');
    $routes->post('auth/logout', 'AuthController::logout');
    $routes->post('auth/forgot-password', 'AuthController::forgotPassword');
    $routes->post('auth/reset-password', 'AuthController::resetPassword');

    // Protected Authentication Routes (Auth Required)
    $routes->get('auth/me', 'AuthController::me', ['filter' => 'auth']);

    // User Routes (Protected)
    $routes->get('users', 'UserController::index', ['filter' => 'auth']);
    $routes->get('users/(:num)', 'UserController::show/$1', ['filter' => 'auth']);
    $routes->post('users', 'UserController::create', ['filter' => ['auth', 'admin']]);
    $routes->put('users/(:num)', 'UserController::update/$1', ['filter' => 'auth']);
    $routes->delete('users/(:num)', 'UserController::delete/$1', ['filter' => ['auth', 'admin']]);

    // Organization Routes
    $routes->get('organizations/(:num)', 'OrganizationController::show/$1', ['filter' => 'auth']);
    $routes->post('organizations', 'OrganizationController::create', ['filter' => 'auth']);
    $routes->put('organizations/(:num)', 'OrganizationController::update/$1', ['filter' => 'permission:settings.edit']);
    $routes->get('organizations/(:num)/members', 'OrganizationController::members/$1', ['filter' => 'auth']);
    $routes->post('organizations/(:num)/members', 'OrganizationController::addMember/$1', ['filter' => 'permission:users.create']);
    $routes->delete('organizations/(:num)/members/(:num)', 'OrganizationController::removeMember/$1/$2', ['filter' => 'permission:users.delete']);
    $routes->get('organizations/(:num)/members/(:num)/monitoring', 'OrganizationController::getMemberMonitoring/$1/$2', ['filter' => 'permission:users.edit']);
    $routes->put('organizations/(:num)/members/(:num)/monitoring', 'OrganizationController::updateMemberMonitoring/$1/$2', ['filter' => 'permission:users.edit']);
    $routes->get('monitoring/settings', 'MonitoringController::mySettings', ['filter' => 'auth']);
    $routes->get('invitations/validate', 'OrganizationController::validateInvitation');

    // Project Routes
    $routes->get('projects', 'ProjectController::index', ['filter' => 'permission:projects.view']);
    $routes->get('projects/(:num)', 'ProjectController::show/$1', ['filter' => 'permission:projects.view']);
    $routes->post('projects', 'ProjectController::create', ['filter' => 'permission:projects.create']);
    $routes->put('projects/(:num)', 'ProjectController::update/$1', ['filter' => 'permission:projects.edit']);
    $routes->delete('projects/(:num)', 'ProjectController::delete/$1', ['filter' => 'permission:projects.delete']);
    $routes->post('projects/(:num)/archive', 'ProjectController::archive/$1', ['filter' => 'permission:projects.archive']);

    // Task Routes
    $routes->get('tasks', 'TaskController::index', ['filter' => 'permission:projects.view']);
    $routes->get('tasks/(:num)', 'TaskController::show/$1', ['filter' => 'permission:projects.view']);
    $routes->post('tasks', 'TaskController::create', ['filter' => 'permission:projects.edit']);
    $routes->put('tasks/(:num)', 'TaskController::update/$1', ['filter' => 'permission:projects.edit']);
    $routes->delete('tasks/(:num)', 'TaskController::delete/$1', ['filter' => 'permission:projects.edit']);

    // Time Entry Routes
    $routes->get('time-entries', 'TimeEntryController::index', ['filter' => 'permission:time.view_own']);
    $routes->post('time-entries/start', 'TimeEntryController::start', ['filter' => 'permission:time.edit_own']);
    $routes->post('time-entries/(:num)/stop', 'TimeEntryController::stop/$1', ['filter' => 'permission:time.edit_own']);
    $routes->post('time-entries/(:num)/pause', 'TimeEntryController::pause/$1', ['filter' => 'permission:time.edit_own']);
    $routes->post('time-entries/(:num)/resume', 'TimeEntryController::resume/$1', ['filter' => 'permission:time.edit_own']);
    $routes->get('time-entries/active', 'TimeEntryController::active', ['filter' => 'permission:time.view_own']);
    $routes->post('time-entries/manual', 'TimeEntryController::manual', ['filter' => 'permission:time.edit_own']);

    // Screenshot Routes
    $routes->group('screenshots', ['filter' => ['auth', 'planFeature:screenshots']], function ($routes) {
        $routes->get('(:num)', 'ScreenshotController::show/$1', ['filter' => 'permission:screenshots.view_own']);
        $routes->get('view/(:num)', 'ScreenshotController::view/$1', ['filter' => 'permission:screenshots.view_own']);
        $routes->post('upload', 'ScreenshotController::upload', ['filter' => 'permission:screenshots.create']);
        $routes->delete('(:num)', 'ScreenshotController::delete/$1', ['filter' => 'permission:screenshots.delete']);
        $routes->get('/', 'ScreenshotController::index', ['filter' => 'permission:screenshots.view_own']);
    });

    // Activity Log Routes
    $routes->group('activity-logs', ['filter' => ['auth', 'planFeature:activity_tracking']], function ($routes) {
        $routes->get('/', 'ActivityLogController::index', ['filter' => 'permission:activity.view_own']);
        $routes->post('sync', 'ActivityLogController::sync', ['filter' => 'permission:activity.create']);
        $routes->get('stats', 'ActivityLogController::productivityStats', ['filter' => 'permission:activity.view_team']);
        $routes->get('top-apps', 'ActivityLogController::topApps', ['filter' => 'permission:activity.view_own']);
    });

    // Invoice Routes
    $routes->group('invoices', ['filter' => ['auth', 'planFeature:invoicing']], function ($routes) {
        $routes->get('/', 'InvoiceController::index', ['filter' => 'permission:invoices.view']);
        $routes->post('/', 'InvoiceController::create', ['filter' => 'permission:invoices.create']);
        $routes->get('(:num)', 'InvoiceController::show/$1', ['filter' => 'permission:invoices.view']);
        $routes->put('(:num)/status', 'InvoiceController::updateStatus/$1', ['filter' => 'permission:invoices.edit']);
        $routes->post('(:num)/send', 'InvoiceController::send/$1', ['filter' => 'permission:invoices.send']);
    }); // Role & Permission Management Routes
    $routes->get('roles', 'RoleController::index', ['filter' => 'permission:settings.view']);
    $routes->post('roles', 'RoleController::create', ['filter' => 'permission:settings.edit']);
    $routes->put('roles/(:num)/permissions', 'RoleController::updatePermissions/$1', ['filter' => 'permission:settings.edit']);
    $routes->get('permissions', 'RoleController::permissions', ['filter' => 'permission:settings.view']);
    $routes->get('users/(:num)/permissions', 'RoleController::userPermissions/$1', ['filter' => 'permission:settings.view']);

    // Report Routes
    $routes->get('reports/summary', 'ReportController::summary', ['filter' => 'auth']);
    $routes->get('reports/time-summary', 'ReportController::timeSummary', ['filter' => 'permission:reports.view_own']);
    $routes->get('reports/project-breakdown', 'ReportController::projectBreakdown', ['filter' => 'permission:reports.view_team']);
    $routes->get('reports/user-productivity/(:num)', 'ReportController::userProductivity/$1', ['filter' => 'permission:reports.view_team']);
    $routes->get('reports/team-leaderboard', 'ReportController::teamLeaderboard', ['filter' => 'permission:reports.view_team']);
    $routes->post('reports/export', 'ReportController::export', ['filter' => 'permission:reports.export']);

    // Notification Routes
    $routes->get('notifications', 'NotificationController::index', ['filter' => 'auth']);
    $routes->get('notifications/unread-count', 'NotificationController::unreadCount', ['filter' => 'auth']);
    $routes->post('notifications/(:num)/read', 'NotificationController::markAsRead/$1', ['filter' => 'auth']);
    $routes->post('notifications/read-all', 'NotificationController::markAllAsRead', ['filter' => 'auth']);
    $routes->delete('notifications/(:num)', 'NotificationController::delete/$1', ['filter' => 'auth']);

    // Plans & Subscription Routes (Public - no auth for plans)
    $routes->get('plans', 'SubscriptionController::plans');
    $routes->get('plans/(:num)', 'SubscriptionController::planDetails/$1');

    // Subscription Management (Auth required)
    $routes->post('subscriptions', 'SubscriptionController::subscribe', ['filter' => 'auth']);
    $routes->post('subscriptions/checkout-session', 'SubscriptionController::checkoutSession', ['filter' => 'auth']);
    $routes->post('subscriptions/confirm-checkout', 'SubscriptionController::confirmCheckout', ['filter' => 'auth']);
    $routes->get('subscriptions/current', 'SubscriptionController::current', ['filter' => 'auth']);
    $routes->put('subscriptions/upgrade', 'SubscriptionController::upgrade', ['filter' => 'auth']);
    $routes->put('subscriptions/downgrade', 'SubscriptionController::downgrade', ['filter' => 'auth']);
    $routes->post('subscriptions/cancel', 'SubscriptionController::cancel', ['filter' => 'auth']);
    $routes->get('subscriptions/usage', 'SubscriptionController::usage', ['filter' => 'auth']);
    $routes->get('subscriptions/history', 'SubscriptionController::history', ['filter' => 'auth']);
});

/*
 * --------------------------------------------------------------------
 * Additional Routing
 * --------------------------------------------------------------------
 * For future API versions, create new groups:
 * $routes->group('api/v2', [...])
 */
