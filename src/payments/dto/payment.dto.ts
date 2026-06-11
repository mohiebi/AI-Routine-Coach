import { ApiProperty } from '@nestjs/swagger';
import { PaymentNetwork, StableTokenSymbol } from '@prisma/client';
import { IsEnum, IsString, Matches } from 'class-validator';

export class CreateCryptoPaymentDto {
  @ApiProperty({ enum: StableTokenSymbol })
  @IsEnum(StableTokenSymbol)
  tokenSymbol!: StableTokenSymbol;

  @ApiProperty({ enum: PaymentNetwork })
  @IsEnum(PaymentNetwork)
  network!: PaymentNetwork;
}

export class SubmitTxHashDto {
  @ApiProperty()
  @IsString()
  @Matches(/^0x[a-fA-F0-9]{64}$/)
  txHash!: string;
}
