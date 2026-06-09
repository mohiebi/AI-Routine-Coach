import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CreateGoalDto } from './dto/create-goal.dto';
import { UpdateGoalDto } from './dto/update-goal.dto';
import { GoalsService } from './goals.service';

@ApiTags('goals')
@Controller('users/:userId/goals')
export class GoalsController {
  constructor(private readonly goalsService: GoalsService) {}

  @Post()
  create(@Param('userId') userId: string, @Body() dto: CreateGoalDto) {
    return this.goalsService.create(userId, dto);
  }

  @Get()
  list(
    @Param('userId') userId: string,
    @Query('includeArchived') includeArchived?: string,
  ) {
    return this.goalsService.list(userId, includeArchived === 'true');
  }

  @Get(':goalId')
  find(@Param('userId') userId: string, @Param('goalId') goalId: string) {
    return this.goalsService.find(userId, goalId);
  }

  @Patch(':goalId')
  update(
    @Param('userId') userId: string,
    @Param('goalId') goalId: string,
    @Body() dto: UpdateGoalDto,
  ) {
    return this.goalsService.update(userId, goalId, dto);
  }

  @Delete(':goalId')
  archive(@Param('userId') userId: string, @Param('goalId') goalId: string) {
    return this.goalsService.archive(userId, goalId);
  }
}
