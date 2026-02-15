import { Request, Response, NextFunction } from 'express';

export const requireApiKey = (req: Request, res: Response, next: NextFunction) => {
  const apiKey = req.headers['x-api-key'];

  if (!process.env.API_KEY) {
    console.error('API_KEY environment variable is not set');
    return res.status(500).json({ success: false, error: 'Server configuration error' });
  }

  if (!apiKey || apiKey !== process.env.API_KEY) {
    return res.status(401).json({ success: false, error: 'Unauthorized: invalid or missing API key' });
  }

  next();
};
