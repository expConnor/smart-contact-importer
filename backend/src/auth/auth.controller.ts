import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { COOKIE_NAME, cookieOptions } from './cookie';
import type { PublicUser } from './types';

@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<PublicUser> {
    const { user, token, expiresAt } = await this.authService.login(dto);

    res.cookie(
      COOKIE_NAME,
      token,
      cookieOptions(expiresAt.getTime() - Date.now()),
    );

    return user;
  }
}
