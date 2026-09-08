import { JwtService } from '@nestjs/jwt';
import { JwtPayload } from './types';
import { Injectable } from '@nestjs/common';

@Injectable()
export class TokenService {
  constructor(private readonly jwt: JwtService) {}

  sign(subject: string): { token: string; expiresAt: Date } {
    const token = this.jwt.sign({}, { subject });
    const { exp } = this.jwt.decode<JwtPayload>(token);
    return { token, expiresAt: new Date(exp * 1000) };
  }

  verify(token: string): JwtPayload {
    return this.jwt.verify<JwtPayload>(token);
  }
}
