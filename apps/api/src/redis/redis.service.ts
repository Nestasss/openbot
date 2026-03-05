import { Injectable, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly client: Redis;

  constructor() {
    const url = process.env.REDIS_URL;
    this.client = url ? new Redis(url) : new Redis();
  }

  get redis() {
    return this.client;
  }

  async onModuleDestroy() {
    await this.client.quit();
  }
}
