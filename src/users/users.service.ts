import { Injectable, NotFoundException } from '@nestjs/common';
import { RegisterTelegramUserDto } from './dto/register-telegram-user.dto';
import { UpdatePreferencesDto } from './dto/update-preferences.dto';
import { UsersRepository } from './users.repository';

@Injectable()
export class UsersService {
  constructor(private readonly usersRepository: UsersRepository) {}

  registerTelegramUser(dto: RegisterTelegramUserDto) {
    return this.usersRepository.upsertTelegramUser({
      telegramId: BigInt(dto.telegramId),
      username: dto.username,
      firstName: dto.firstName,
      timezone: dto.timezone,
    });
  }

  async findByTelegramId(telegramId: number) {
    const user = await this.usersRepository.findByTelegramId(
      BigInt(telegramId),
    );
    if (!user || user.deletedAt) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async findById(userId: string) {
    const user = await this.usersRepository.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async updatePreferences(userId: string, dto: UpdatePreferencesDto) {
    await this.findById(userId);
    const preference = await this.usersRepository.updatePreferences(
      userId,
      dto,
    );

    if (dto.timezone) {
      await this.usersRepository.updateUser(userId, { timezone: dto.timezone });
    }

    return preference;
  }
}
