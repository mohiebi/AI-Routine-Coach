import { BadGatewayException, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';

type DtoClass<T> = new () => T;

@Injectable()
export class AiValidationService {
  validate<T extends object>(dtoClass: DtoClass<T>, payload: unknown): T {
    const instance = plainToInstance(dtoClass, payload);
    const errors = validateSync(instance, {
      forbidNonWhitelisted: true,
      whitelist: true,
    });

    if (errors.length > 0) {
      throw new BadGatewayException('AI returned an invalid response shape');
    }

    return instance;
  }
}
