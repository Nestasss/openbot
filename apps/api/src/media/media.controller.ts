import {
  Controller,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { JwtAuthGuard } from '../auth/jwt.guard';

function safeExt(originalName: string) {
  const e = extname(originalName || '').toLowerCase();
  // allow common image types only for MVP
  if (!['.jpg', '.jpeg', '.png', '.webp'].includes(e)) return '';
  return e;
}

@UseGuards(JwtAuthGuard)
@Controller('media')
export class MediaController {
  @Post('photo')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 5 * 1024 * 1024 },
      storage: diskStorage({
        destination: 'uploads',
        filename: (_req, file, cb) => {
          const ext = safeExt(file.originalname);
          const base = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
          cb(null, `${base}${ext || ''}`);
        },
      }),
      fileFilter: (_req, file, cb) => {
        const ext = safeExt(file.originalname);
        if (!ext) return cb(new BadRequestException('UNSUPPORTED_FILE_TYPE') as any, false);
        cb(null, true);
      },
    }),
  )
  async upload(@UploadedFile() file?: { filename: string; size: number; mimetype: string }) {
    if (!file) throw new BadRequestException('NO_FILE');
    return {
      ok: true,
      mediaPath: `/uploads/${file.filename}`,
      size: file.size,
      mimetype: file.mimetype,
    };
  }

  // avatar upload (<= 3MB)
  @Post('avatar')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 3 * 1024 * 1024 },
      storage: diskStorage({
        destination: 'uploads/avatars',
        filename: (_req, file, cb) => {
          const ext = safeExt(file.originalname);
          const base = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
          cb(null, `${base}${ext || ''}`);
        },
      }),
      fileFilter: (_req, file, cb) => {
        const ext = safeExt(file.originalname);
        if (!ext) return cb(new BadRequestException('UNSUPPORTED_FILE_TYPE') as any, false);
        cb(null, true);
      },
    }),
  )
  async uploadAvatar(@UploadedFile() file?: { filename: string; size: number; mimetype: string }) {
    if (!file) throw new BadRequestException('NO_FILE');
    return {
      ok: true,
      avatarPath: `/uploads/avatars/${file.filename}`,
      size: file.size,
      mimetype: file.mimetype,
    };
  }
}
