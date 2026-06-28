import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello(): string {
    return 'FaceBlur API is running! 🎭';
  }
}