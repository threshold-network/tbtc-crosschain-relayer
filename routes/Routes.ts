import express from 'express';
import type { Request, Response, NextFunction } from 'express';

import Operations from '../controllers/Operations.controller.js';
import Utils from '../controllers/Utils.controller.js';
import { EndpointController } from '../controllers/Endpoint.controller.js';
import { chainHandlerRegistry } from '../handlers/ChainHandlerRegistry.js';
import type { ChainHandlerInterface } from '../interfaces/ChainHandler.interface.js';
import logger from '../utils/Logger.js';

// Custom Request Interface
export interface RequestWithChainInfo extends Request {
  chainName: string;
  chainHandler: ChainHandlerInterface | null; // null if chainName is 'all' and allowed
}

// Middleware factory for chain validation
type ChainValidationOptions = {
  allowAllKeyword?: boolean;
};

const createChainValidator = (options: ChainValidationOptions = {}) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const expressReq = req as RequestWithChainInfo;
    const { chainName } = req.params as { chainName: string };

    expressReq.chainName = chainName;
    const handler = chainHandlerRegistry.get(chainName);

    if (options.allowAllKeyword && chainName === 'all') {
      expressReq.chainHandler = null; // Special case for 'all'
      return next();
    }

    if (!handler) {
      return res.status(404).json({ success: false, error: `Unknown chain: ${chainName}` });
    }

    expressReq.chainHandler = handler as ChainHandlerInterface;
    return next();
  };
};

const validateChainAllowAll = createChainValidator({ allowAllKeyword: true });
const validateChainStrict = createChainValidator({ allowAllKeyword: false });

export const router = express.Router();

// Controllers
const utils = new Utils();
const operations = new Operations();

// Default route for the API
router.get('/', utils.defaultController);

// Ping route for the API
router.get('/status', utils.pingController);

// Audit logs route for a specific chain
router.get('/api/:chainName/audit-logs', validateChainAllowAll, (req: Request, res: Response) => {
  const { chainName } = req as RequestWithChainInfo;
  // The controller expects chainName as a third argument.
  return utils.auditLogsController(req, res, chainName);
});

// Diagnostic routes for a specific chain
router.get('/api/:chainName/diagnostics', validateChainAllowAll, (req: Request, res: Response) => {
  const { chainName } = req as RequestWithChainInfo;
  return operations.getAllOperations(req, res, chainName);
});

router.get(
  '/api/:chainName/diagnostics/queued',
  validateChainAllowAll,
  (req: Request, res: Response) => {
    const { chainName } = req as RequestWithChainInfo;
    return operations.getAllQueuedOperations(req, res, chainName);
  },
);

router.get(
  '/api/:chainName/diagnostics/initialized',
  validateChainAllowAll,
  (req: Request, res: Response) => {
    const { chainName } = req as RequestWithChainInfo;
    return operations.getAllInitializedOperations(req, res, chainName);
  },
);

router.get(
  '/api/:chainName/diagnostics/finalized',
  validateChainAllowAll,
  (req: Request, res: Response) => {
    const { chainName } = req as RequestWithChainInfo;
    return operations.getAllFinalizedOperations(req, res, chainName);
  },
);

// Multi-chain endpoint routes (require chainName as path param)
if (process.env.USE_ENDPOINT === 'true') {
  // Endpoint for receiving reveal data
  router.post('/api/:chainName/reveal', validateChainStrict, (req: Request, res: Response) => {
    const { chainHandler, chainName } = req as RequestWithChainInfo;
    const chainConfig = chainHandler?.config;

    if (!chainConfig?.supportsRevealDepositAPI) {
      logger.warn(
        `Reveal deposit API called for chain ${chainConfig}, but it's not supported/enabled in config.`,
      );
      return res.status(405).json({
        success: false,
        error: `Reveal deposit API is not supported or enabled for chain: ${chainName}`,
      });
    }
    const endpointController = new EndpointController(chainHandler!);
    return endpointController.handleReveal(req, res);
  });

  // Endpoint for checking deposit status
  router.get(
    '/api/:chainName/deposit/:depositId',
    validateChainStrict,
    (req: Request, res: Response) => {
      const { chainHandler } = req as RequestWithChainInfo;
      const endpointController = new EndpointController(chainHandler!);
      return endpointController.getDepositStatus(req, res);
    },
  );
}

// Gasless deposit notification endpoint (always enabled, independent of USE_ENDPOINT)
// This endpoint allows the backend to notify the relayer when a deposit has been initialized
router.post(
  '/api/:chainName/deposit/notify',
  validateChainStrict,
  (req: Request, res: Response) => {
    const { chainHandler } = req as RequestWithChainInfo;
    const endpointController = new EndpointController(chainHandler!);
    return endpointController.handleDepositNotification(req, res);
  },
);

export default router;
