const { strict: assert } = require('assert');
const path = require('path');
const { promises: fs } = require('fs');
const { exitWithError } = require('../../development/lib/exit-with-error');
const {
  isWritable,
  getFirstParentDirectoryThatExists,
} = require('../helpers/file');
const { convertToHexValue, withFixtures } = require('./helpers');

async function exportResults(data) {
  if (data) {
    const outPath = 'user_actions/stats.json';
    const outputDirectory = path.dirname(outPath);
    const existingParentDirectory = await getFirstParentDirectoryThatExists(
      outputDirectory,
    );
    if (!(await isWritable(existingParentDirectory))) {
      throw new Error('Specified output file directory is not writable');
    }
    if (outputDirectory !== existingParentDirectory) {
      await fs.mkdir(outputDirectory, { recursive: true });
    }
    await fs.writeFile(outPath, JSON.stringify(data, null, 2));
  } else {
    console.log(JSON.stringify(data, null, 2));
  }
}

describe('MV3 - load times in ms', function () {
  const ganacheOptions = {
    accounts: [
      {
        secretKey:
          '0x7C9529A67102755B7E6102D6D950AC5D5863C98713805CEC576B945B15B71EAC',
        balance: convertToHexValue(25000000000000000000),
      },
    ],
  };
  const loadingTimes = {};
  it('should measure the time for loading a new account', async function () {
    await withFixtures(
      {
        fixtures: 'imported-account',
        ganacheOptions,
        title: this.test.title,
      },
      async ({ driver }) => {
        await driver.navigate();
        await driver.fill('#password', 'correct horse battery staple');
        await driver.press('#password', driver.Key.ENTER);

        await driver.clickElement('.account-menu__icon');
        const timestampBeforeAction = new Date();
        await driver.clickElement({ text: 'Create Account', tag: 'div' });
        await driver.fill('.new-account-create-form input', '2nd account');
        await driver.clickElement({ text: 'Create', tag: 'button' });

        await driver.waitForSelector({
          css: '.currency-display-component__text',
          text: '0',
        });
        const timestampAfterAction = new Date();
        loadingTimes.createAccount =
          timestampAfterAction - timestampBeforeAction;
      },
    );
  });
  it('should measure the time for confirming a transaction', async function () {
    await withFixtures(
      {
        fixtures: 'imported-account',
        ganacheOptions,
        title: this.test.title,
      },
      async ({ driver }) => {
        await driver.navigate();
        await driver.fill('#password', 'correct horse battery staple');
        await driver.press('#password', driver.Key.ENTER);

        await driver.clickElement('[data-testid="eth-overview-send"]');

        await driver.fill(
          'input[placeholder="Search, public address (0x), or ENS"]',
          '0x2f318C334780961FB129D2a6c30D0763d9a5C970',
        );

        const inputAmount = await driver.findElement('.unit-input__input');
        await inputAmount.fill('1000');

        const errorAmount = await driver.findElement('.send-v2__error-amount');
        assert.equal(
          await errorAmount.getText(),
          'Insufficient funds.',
          'send screen should render an insufficient fund error message',
        );

        await inputAmount.press(driver.Key.BACK_SPACE);
        await inputAmount.press(driver.Key.BACK_SPACE);
        await inputAmount.press(driver.Key.BACK_SPACE);
        await driver.wait(async () => {
          const sendDialogMsgs = await driver.findElements(
            '.send-v2__form div.dialog',
          );
          return sendDialogMsgs.length === 1;
        }, 10000);

        await driver.assertElementNotPresent('.send-v2__error-amount');

        const amountMax = await driver.findClickableElement(
          '.send-v2__amount-max',
        );
        await amountMax.click();

        let inputValue = await inputAmount.getProperty('value');

        assert(Number(inputValue) > 24);

        await amountMax.click();

        assert.equal(await inputAmount.isEnabled(), true);

        await inputAmount.fill('1');

        inputValue = await inputAmount.getProperty('value');
        assert.equal(inputValue, '1');

        await driver.clickElement({ text: 'Next', tag: 'button' });

        const timestampBeforeAction = new Date();
        await driver.clickElement({ text: 'Confirm', tag: 'button' });

        await driver.clickElement('[data-testid="home__activity-tab"]');
        await driver.wait(async () => {
          const confirmedTxes = await driver.findElements(
            '.transaction-list__completed-transactions .transaction-list-item',
          );
          return confirmedTxes.length === 1;
        }, 10000);

        await driver.waitForSelector('.transaction-status--confirmed');
        const timestampAfterAction = new Date();
        loadingTimes.sendTx = timestampAfterAction - timestampBeforeAction;

        exportResults(loadingTimes).catch((error) => {
          exitWithError(error);
        });
      },
    );
  });
});