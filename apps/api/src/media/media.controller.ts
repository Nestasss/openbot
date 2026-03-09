import {
  Controller,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { execFile } from 'child_process';
import * as fsSync from 'fs';
import { promises as fs } from 'fs';
import { JwtAuthGuard } from '../auth/jwt.guard';

function safeExt(originalName: string) {
  const e = extname(originalName || '').toLowerCase();
  // allow common image types only for MVP
  if (!['.jpg', '.jpeg', '.png', '.webp'].includes(e)) return '';
  return e;
}

function isAllowedAudioMime(mime?: string) {
  const m = (mime || '').toLowerCase();
  // iOS Safari may produce audio/mp4
  return [
    'audio/mp4',
    'audio/aac',
    'audio/mpeg',
    'audio/webm',
    'audio/ogg',
    // some browsers may report video/webm for audio-only webm
    'video/webm',
  ].includes(m);
}

function execFileAsync(cmd: string, args: string[]) {
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    execFile(cmd, args, { maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) return reject(Object.assign(err, { stdout, stderr }));
      resolve({ stdout: String(stdout || ''), stderr: String(stderr || '') });
    });
  });
}

async function probeDurationMs(filePath: string): Promise<number> {
  // ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 file
  const { stdout } = await execFileAsync('ffprobe', [
    '-v',
    'error',
    '-show_entries',
    'format=duration',
    '-of',
    'default=nw=1:nk=1',
    filePath,
  ]);

  const seconds = Number(String(stdout || '').trim());
  if (!Number.isFinite(seconds) || seconds <= 0) throw new Error('FFPROBE_BAD_DURATION');
  return Math.round(seconds * 1000);
}

async function transcodeToM4a(inputPath: string, outputPath: string) {
  // AAC in m4a container is the most universally playable (incl. iOS Safari).
  await execFileAsync('ffmpeg', [
    '-y',
    '-i',
    inputPath,
    '-vn',
    '-c:a',
    'aac',
    '-b:a',
    '96k',
    '-movflags',
    '+faststart',
    outputPath,
  ]);
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
      mediaKind: 'photo' as const,
      mediaPath: `/uploads/${file.filename}`,
      mediaSize: file.size,
      mediaMime: file.mimetype,
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

  // Voice message upload (<= 180 sec). We normalize everything to .m4a for iOS compatibility.
  @Post('voice')
  @UseInterceptors(
    FileInterceptor('file', {
      // allow some headroom; 180s @ 96kbps ~ 2.2MB, but source may be larger
      limits: { fileSize: 25 * 1024 * 1024 },
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          // Multer requires destination to exist.
          const dir = join(process.cwd(), 'uploads', 'voices', 'tmp');
          fsSync.mkdirSync(dir, { recursive: true });
          cb(null, dir);
        },
        filename: (_req, file, cb) => {
          const base = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
          const ext = extname(file.originalname || '').toLowerCase() || '';
          cb(null, `${base}${ext || ''}`);
        },
      }),
      fileFilter: (_req, file, cb) => {
        if (!isAllowedAudioMime(file.mimetype)) {
          return cb(new BadRequestException('UNSUPPORTED_AUDIO_TYPE') as any, false);
        }
        cb(null, true);
      },
    }),
  )
  async uploadVoice(@UploadedFile() file?: { filename: string; size: number; mimetype: string }) {
    if (!file) throw new BadRequestException('NO_FILE');

    const tmpPath = join(process.cwd(), 'uploads', 'voices', 'tmp', file.filename);
    const outBase = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const outFile = `${outBase}.m4a`;
    const outRel = `/uploads/voices/${outFile}`;
    const outPath = join(process.cwd(), 'uploads', 'voices', outFile);

    await fs.mkdir(join(process.cwd(), 'uploads', 'voices', 'tmp'), { recursive: true });
    await fs.mkdir(join(process.cwd(), 'uploads', 'voices'), { recursive: true });

    try {
      await transcodeToM4a(tmpPath, outPath);
      const durationMs = await probeDurationMs(outPath);

      if (durationMs > 180_000) {
        // delete both files
        await fs.unlink(outPath).catch(() => null);
        throw new BadRequestException('VOICE_TOO_LONG');
      }

      const stat = await fs.stat(outPath);

      // cleanup tmp
      await fs.unlink(tmpPath).catch(() => null);

      return {
        ok: true,
        mediaKind: 'voice' as const,
        mediaPath: outRel,
        mediaSize: stat.size,
        mediaMime: 'audio/mp4',
        mediaDurationMs: durationMs,
      };
    } catch (e: any) {
      // cleanup tmp
      await fs.unlink(tmpPath).catch(() => null);
      if (e instanceof BadRequestException) throw e;

      // ffmpeg/ffprobe missing or failed
      throw new InternalServerErrorException('VOICE_TRANSCODE_FAILED');
    }
  }
}
