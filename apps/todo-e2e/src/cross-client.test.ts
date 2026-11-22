import { expect, test } from '@playwright/test'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const swiftSmoke = process.env.TODO_SWIFT_SMOKE

test('browser create, Swift completion, browser acknowledgement', async ({
  page
}) => {
  test.skip(
    !swiftSmoke,
    'Set TODO_SWIFT_SMOKE to the compiled native smoke executable'
  )
  const title = `Cross-client ${crypto.randomUUID()}`
  const committed = () =>
    page.waitForResponse(
      response =>
        response.url().endsWith('/api/mutations') &&
        response.ok() &&
        response.request().postDataJSON()?.title === title
    )
  await page.goto('/')
  await page.getByRole('textbox', { name: 'New todo' }).fill(title)
  await Promise.all([
    committed(),
    page.getByRole('button', { name: 'Add', exact: true }).click()
  ])
  await promisify(execFile)(swiftSmoke as string, [], {
    env: {
      ...process.env,
      TODO_TEST_API: 'http://127.0.0.1:47831/api/',
      TODO_WEB_TITLE: title
    }
  })
  await page.getByRole('button', { name: 'Sync', exact: true }).click()
  await expect(
    page.getByRole('checkbox', { name: `Complete ${title}`, exact: true })
  ).toBeChecked()
  const row = page.getByRole('listitem').filter({ hasText: title })
  await Promise.all([
    committed(),
    row.getByRole('button', { name: 'Delete' }).click()
  ])
  await expect(row).toHaveCount(0)
})
