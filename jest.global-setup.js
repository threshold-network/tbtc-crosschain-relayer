import { execSync } from 'child_process';

export default async () => {
  const testDatabaseUrl =
    process.env.DATABASE_URL ||
    'postgresql://postgres:postgres@localhost:5432/tbtc_relayer?schema=public';

  console.log(
    'Jest Global Setup: Using database:',
    testDatabaseUrl.replace(/\/\/[^@]+@/, '//***:***@'),
  );

  const prismaEnv = {
    ...process.env,
    DATABASE_URL: testDatabaseUrl,
    NODE_ENV: 'test',
  };

  try {
    console.log('Jest Global Setup: Forcing database schema push...');
    execSync('yarn prisma db push --force-reset --accept-data-loss', {
      env: prismaEnv,
      stdio: 'inherit',
    });
    console.log('Jest Global Setup: Database schema pushed successfully.');

    console.log('Jest Global Setup: Generating Prisma clients...');
    execSync('yarn prisma generate', {
      env: prismaEnv,
      stdio: 'inherit',
    });
    console.log('Jest Global Setup: Prisma clients generated successfully.');
  } catch (error) {
    console.error('Jest Global Setup: Error during Prisma setup:', error);
    throw error;
  }

  console.log('Jest Global Setup: Completed successfully.');
};
