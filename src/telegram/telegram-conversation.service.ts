import { Injectable } from '@nestjs/common';
import { ConversationState } from './telegram.types';

@Injectable()
export class TelegramConversationService {
  private readonly map = new Map<number, ConversationState>();

  get(userId: number): ConversationState | undefined {
    return this.map.get(userId);
  }

  set(userId: number, state: ConversationState): void {
    this.map.set(userId, state);
  }

  delete(userId: number): void {
    this.map.delete(userId);
  }
}
