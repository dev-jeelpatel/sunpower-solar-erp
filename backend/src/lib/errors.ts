export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public fields?: Record<string, string>,
  ) {
    super(message);
  }
}
export const badRequest = (msg: string, fields?: Record<string, string>) => new HttpError(400, msg, fields);
export const unauthorized = (msg = 'Please sign in') => new HttpError(401, msg);
export const forbidden = (msg = 'You do not have permission to do this') => new HttpError(403, msg);
export const notFound = (what = 'Record') => new HttpError(404, `${what} not found`);
export const conflict = (msg: string, fields?: Record<string, string>) => new HttpError(409, msg, fields);
export const unprocessable = (msg: string, fields?: Record<string, string>) => new HttpError(422, msg, fields);
