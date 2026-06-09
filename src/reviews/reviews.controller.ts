import { Controller, Get, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ReviewsService } from './reviews.service';

@ApiTags('reviews')
@Controller('users/:userId/reviews')
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Post('weekly')
  generateWeekly(@Param('userId') userId: string) {
    return this.reviewsService.generateWeeklyReview(userId, new Date());
  }

  @Get('weekly/latest')
  latestWeekly(@Param('userId') userId: string) {
    return this.reviewsService.latestWeeklyReview(userId);
  }

  @Post('monthly')
  generateMonthly(@Param('userId') userId: string) {
    return this.reviewsService.generateMonthlyReview(userId, new Date());
  }
}
