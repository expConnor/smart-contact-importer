import type { Request } from 'express';

export type JwtPayload = {
  sub: string;
  iat: number;
  exp: number;
};

export type PublicUser = {
  id: string;
  email: string;
};

export type AuthenticatedRequest = Request & {
  user: { userId: string };
};
