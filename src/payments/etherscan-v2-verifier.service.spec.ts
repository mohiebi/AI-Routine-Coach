import { ConfigService } from '@nestjs/config';
import { Prisma, StableTokenSymbol } from '@prisma/client';
import { EtherscanV2VerifierService } from './etherscan-v2-verifier.service';

const transferTopic =
  '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const receiver = '0x1111111111111111111111111111111111111111';
const token = '0x2222222222222222222222222222222222222222';

describe('EtherscanV2VerifierService', () => {
  const config = {
    get: jest.fn((key: string) => (key === 'ETHERSCAN_API_KEY' ? 'key' : undefined)),
  } as unknown as ConfigService;

  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it('verifies a matching token transfer', async () => {
    mockFetch({
      receipt: {
        status: '0x1',
        blockNumber: '0x64',
        logs: [
          {
            address: token,
            topics: [transferTopic, padAddress('0xabc'), padAddress(receiver)],
            data: `0x${BigInt(10_500_000).toString(16)}`,
          },
        ],
      },
      latestBlock: '0x78',
    });
    const service = new EtherscanV2VerifierService(config);

    const result = await service.verify({
      txHash: `0x${'a'.repeat(64)}`,
      chainId: 42161,
      tokenSymbol: StableTokenSymbol.USDC,
      tokenContract: token,
      expectedAmount: new Prisma.Decimal('10.037'),
      receiverAddress: receiver,
      confirmations: 20,
      tokenDecimals: 6,
    });

    expect(result.verified).toBe(true);
  });

  it('rejects underpayment', async () => {
    mockFetch({
      receipt: {
        status: '0x1',
        blockNumber: '0x64',
        logs: [
          {
            address: token,
            topics: [transferTopic, padAddress('0xabc'), padAddress(receiver)],
            data: `0x${BigInt(9_000_000).toString(16)}`,
          },
        ],
      },
      latestBlock: '0x78',
    });
    const service = new EtherscanV2VerifierService(config);

    const result = await service.verify({
      txHash: `0x${'a'.repeat(64)}`,
      chainId: 42161,
      tokenSymbol: StableTokenSymbol.USDC,
      tokenContract: token,
      expectedAmount: new Prisma.Decimal('10.037'),
      receiverAddress: receiver,
      confirmations: 20,
      tokenDecimals: 6,
    });

    expect(result.verified).toBe(false);
    expect(result.reason).toContain('below expected');
  });
});

function mockFetch({
  receipt,
  latestBlock,
}: {
  receipt: unknown;
  latestBlock: string;
}) {
  const fetchMock = jest
    .fn()
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ result: receipt }),
    })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ result: latestBlock }),
    });
  global.fetch = fetchMock as never;
}

function padAddress(address: string) {
  return `0x${address.replace(/^0x/, '').padStart(64, '0')}`;
}
