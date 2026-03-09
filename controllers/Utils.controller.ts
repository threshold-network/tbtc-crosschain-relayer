import type { Request, Response } from 'express';
import CustomResponse from '../helpers/CustomResponse.helper.js';
import { logErrorContext } from '../utils/Logger.js';
import { prisma } from '../utils/prisma.js';
import { appConfig } from '../config/app.config.js';

export default class Utils {
  /**
   * @name defaultController
   * @description Default controller
   * @method GET
   * @returns {Object} API information
   */
  defaultController = (req: Request, res: Response): void => {
    const response = new CustomResponse(res);
    const version = appConfig.APP_VERSION;
    const name = appConfig.APP_NAME;
    return response.ok('API Information: ', {
      name,
      version,
    });
  };

  /**
   * @name pingController
   * @description Check if API is running
   * @method GET
   * @returns {Object} API status
   **/
  pingController = async (req: Request, res: Response): Promise<void> => {
    const response = new CustomResponse(res);

    try {
      return response.ok();
    } catch (err) {
      logErrorContext('Error pinging API:', err);
      return response.ko((err as Error).message);
    }
  };

  /**
   * Get audit logs within a time range
   * @param req Express request
   * @param res Express response
   */
  public auditLogsController = async (req: Request, res: Response, chainName: string) => {
    const response = new CustomResponse(res);
    try {
      // Check if limit is specified in query
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 100;
      if (isNaN(limit) || limit <= 0) {
        return response.ko('Invalid limit parameter. Must be a positive integer.');
      }

      // Check if depositId filter is specified
      const depositId = req.query.depositId as string;

      // Check if eventType filter is specified
      const eventType = req.query.eventType as string;

      // Check if start date is specified
      let startDateISO: string | undefined;
      if (req.query.startDate) {
        const parsedStartDate = new Date(req.query.startDate as string);
        if (isNaN(parsedStartDate.getTime())) {
          return response.ko('Invalid startDate parameter. Must be a valid date string.');
        }
        startDateISO = parsedStartDate.toISOString();
      }

      // Check if end date is specified
      let endDateISO: string | undefined;
      if (req.query.endDate) {
        const parsedEndDate = new Date(req.query.endDate as string);
        if (isNaN(parsedEndDate.getTime())) {
          return response.ko('Invalid endDate parameter. Must be a valid date string.');
        }
        endDateISO = parsedEndDate.toISOString();
      }

      const whereClause: any = {};

      // If chainName can be 'all', you might want to omit the chainId filter.
      // For now, assuming chainName maps directly to a specific chainId or is required.
      if (chainName && chainName.toLowerCase() !== 'all') {
        whereClause.chainId = chainName;
      } else if (!chainName || chainName.toLowerCase() !== 'all') {
        return response.ko('Chain ID is required.');
      }

      if (depositId) {
        whereClause.depositId = depositId;
      }
      if (eventType) {
        whereClause.eventType = eventType;
      }
      if (startDateISO) {
        whereClause.timestamp = { ...whereClause.timestamp, gte: startDateISO };
      }
      if (endDateISO) {
        whereClause.timestamp = { ...whereClause.timestamp, lte: endDateISO };
      }

      const logs = await prisma.auditLog.findMany({
        where: whereClause,
        orderBy: {
          timestamp: 'desc',
        },
        take: limit,
      });

      const total = await prisma.auditLog.count({ where: whereClause });

      // Return the logs
      return response.ok('Audit logs retrieved successfully', {
        logs,
        total,
        limit,
        fetchedCount: logs.length,
        filters: {
          chainName: whereClause.chainId, // Reflects the actual chainId used in query
          depositId,
          eventType,
          startDate: startDateISO,
          endDate: endDateISO,
        },
      });
    } catch (error: any) {
      logErrorContext('Error retrieving audit logs:', error);
      return response.custom(500, 'Error retrieving audit logs: ' + error.message, error);
    }
  };
}
