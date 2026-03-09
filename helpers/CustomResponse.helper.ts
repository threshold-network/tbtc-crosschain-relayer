import type { Response } from 'express';
import type { ResponseJson } from '../types/ResponseJson.type.js';

/**
 * @class CustomResponse
 * @description Response helper
 * @version 0.0.1
 */

export class CustomResponse {
  private res: Response;
  private responseJson: ResponseJson;

  constructor(res: Response) {
    this.res = res;
    this.responseJson = {
      error: null,
      message: null,
      data: undefined,
    };
  }

  ko404(): void {
    this.responseJson.error = true;
    this.responseJson.message = 'Route not found';

    this.res.status(404).send(this.responseJson);
  }

  ko(message: string): void {
    this.responseJson.error = true;
    this.responseJson.message = message;

    this.res.status(400).send(this.responseJson);
  }

  ok<T = unknown>(message?: string, data?: T): void {
    this.responseJson.error = false;
    this.responseJson.message = message || 'Operation successful';
    this.responseJson.data = data !== undefined ? data : null;

    this.res.status(200).send(this.responseJson);
  }

  custom(codeStatus: number, message: string, err: unknown): void {
    this.responseJson.error = true;
    this.responseJson.message = message;
    this.responseJson.data = err;

    this.res.status(codeStatus).send(this.responseJson);
  }
}

export default CustomResponse;
