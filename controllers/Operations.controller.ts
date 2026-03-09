import type { Request, Response } from 'express';
import CustomResponse from '../helpers/CustomResponse.helper.js';
import { logErrorContext } from '../utils/Logger.js';
import type { Deposit } from '../types/Deposit.type.js';
import { DepositStatus } from '../types/DepositStatus.enum.js';
import { prisma } from '../utils/prisma.js';

/**
 * @name Operations
 * @description Operations controller
 */
export default class Operations {
  /**
   * @name getAllOperations
   * @description Retrieves all operations from JSON storage and sends them in the response.
   * If an error occurs, logs the error and sends an error message in the response.
   * @param {Request} req - The request object.
   * @param {Response} res - The response object.
   * @method GET
   * @returns {Array<Deposit>} A promise that resolves to an array of deposits.
   */
  getAllOperations = async (req: Request, res: Response, chainName: string): Promise<void> => {
    const response = new CustomResponse(res);
    try {
      const whereClause: any = {};
      if (chainName && chainName.toLowerCase() !== 'all') {
        whereClause.chainId = chainName;
      }

      const operations: Deposit[] = await prisma.deposit.findMany({
        where: whereClause,
        orderBy: { dates: 'desc' },
      });
      response.ok('OK - Retrieved all operations', operations);
    } catch (err) {
      logErrorContext('Error fetching all operations:', err);
      response.ko((err as Error).message);
    }
  };

  /**
   * @name getAllQueuedOperations
   * @description Retrieves all pending operations from JSON storage and sends them in the response.
   * If an error occurs, logs the error and sends an error message in the response.
   * @param {Request} req - The request object.
   * @param {Response} res - The response object.
   * @method GET
   * @returns {Array<Deposit>} A promise that resolves to an array of deposits.
   */
  getAllQueuedOperations = async (
    req: Request,
    res: Response,
    chainName: string,
  ): Promise<void> => {
    const response = new CustomResponse(res);
    try {
      const whereClause: any = { status: DepositStatus.QUEUED };
      if (chainName && chainName.toLowerCase() !== 'all') {
        whereClause.chainId = chainName;
      }

      const operations: Deposit[] = await prisma.deposit.findMany({
        where: whereClause,
        orderBy: { dates: 'desc' },
      });
      return response.ok('OK - Retrieved all queued operations', operations);
    } catch (err) {
      logErrorContext('Error fetching queued operations:', err);
      return response.ko((err as Error).message);
    }
  };

  /**
   * @name getAllInitializedOperations
   * @description Retrieves all initialized operations from JSON storage and sends them in the response.
   * If an error occurs, logs the error and sends an error message in the response.
   * @param {Request} req - The request object.
   * @param {Response} res - The response object.
   * @method GET
   * @returns {Promise<Array<Deposit>>} A promise that resolves to an array of deposits.
   */
  getAllInitializedOperations = async (
    req: Request,
    res: Response,
    chainName: string,
  ): Promise<void> => {
    const response = new CustomResponse(res);
    try {
      const whereClause: any = { status: DepositStatus.INITIALIZED };
      if (chainName && chainName.toLowerCase() !== 'all') {
        whereClause.chainId = chainName;
      }

      const operations: Deposit[] = await prisma.deposit.findMany({
        where: whereClause,
        orderBy: { dates: 'desc' },
      });
      return response.ok('OK - Retrieved all initialized operations', operations);
    } catch (err) {
      logErrorContext('Error fetching initialized operations:', err);
      return response.ko((err as Error).message);
    }
  };

  /**
   * @name getAllFinalizedOperations
   * @description Retrieves all finalized operations from JSON storage and sends them in the response.
   * If an error occurs, logs the error and sends an error message in the response.
   * @param {Request} req - The request object.
   * @param {Response} res - The response object.
   * @method GET
   * @returns {Promise<Array<Deposit>>} A promise that resolves to an array of deposits.
   */
  getAllFinalizedOperations = async (
    req: Request,
    res: Response,
    chainName: string,
  ): Promise<void> => {
    const response = new CustomResponse(res);
    try {
      const whereClause: any = { status: DepositStatus.FINALIZED };
      if (chainName && chainName.toLowerCase() !== 'all') {
        whereClause.chainId = chainName;
      }
      const operations: Deposit[] = await prisma.deposit.findMany({
        where: whereClause,
        orderBy: { dates: 'desc' },
      });
      return response.ok('OK - Retrieved all finalized operations', operations);
    } catch (err) {
      logErrorContext('Error fetching finalized operations:', err);
      return response.ko((err as Error).message);
    }
  };
}
