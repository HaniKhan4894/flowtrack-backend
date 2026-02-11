<?php

namespace App\Filters;

use CodeIgniter\Filters\FilterInterface;
use CodeIgniter\HTTP\RequestInterface;
use CodeIgniter\HTTP\ResponseInterface;
use App\Services\SubscriptionService;

class PlanFeatureFilter implements FilterInterface
{
    /**
     * Do whatever processing this filter needs to do.
     * By default it should not return anything during normal execution.
     * However, in the event that it should stop execution, then it should return an instance of the ResponseInterface.
     *
     * @param RequestInterface $request
     * @param array|null       $arguments
     *
     * @return mixed
     */
    public function before(RequestInterface $request, $arguments = null)
    {
        if (empty($arguments)) {
            return $request;
        }

        $featureKey = $arguments[0];
        
        $incomingRequest = service('request');
        
        // Get organization_id from request (attached by AuthFilter or passed as GET/POST)
        $organizationId = $incomingRequest->getGet('organization_id') ?: $incomingRequest->getPost('organization_id');
        
        // If not in params, check if it was attached to request object by AuthFilter
        if (!$organizationId && isset($request->organization_id)) {
            $organizationId = $request->organization_id;
        }

        if (!$organizationId) {
            return $request; // Let it pass if no org ID, other filters will catch auth issues
        }

        $subscriptionService = new SubscriptionService();
        
        if (!$subscriptionService->checkFeatureLimit($organizationId, $featureKey)) {
            $response = service('response');
            return $response->setJSON([
                'success' => false,
                'message' => "The '{$featureKey}' feature is not available on your current plan. Please upgrade to access this feature.",
                'error_code' => 'PLAN_LIMIT_REACHED',
                'upgrade_url' => '/billing/plans'
            ])->setStatusCode(403);
        }

        return $request;
    }

    /**
     * Allows After filters to inspect and modify the response
     * object as needed. This method does not allow any way
     * to stop execution of other after filters, short of
     * throwing an Exception or Error.
     *
     * @param RequestInterface  $request
     * @param ResponseInterface $response
     * @param array|null        $arguments
     *
     * @return mixed
     */
    public function after(RequestInterface $request, ResponseInterface $response, $arguments = null)
    {
        // No action needed after
    }
}
