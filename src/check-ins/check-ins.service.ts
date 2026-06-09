import { Injectable } from '@nestjs/common';
import { todayInTimezone } from '../common/time/timezone.util';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { CreateDailyCheckInDto } from './dto/create-daily-check-in.dto';

@Injectable()
export class CheckInsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
  ) {}

  async saveToday(userId: string, dto: CreateDailyCheckInDto) {
    const user = await this.usersService.findById(userId);
    const timezone = user.preference?.timezone ?? user.timezone;
    const date = todayInTimezone(timezone);

    return this.prisma.dailyCheckIn.upsert({
      where: { userId_date: { userId, date } },
      create: { userId, date, ...dto },
      update: dto,
    });
  }
}
