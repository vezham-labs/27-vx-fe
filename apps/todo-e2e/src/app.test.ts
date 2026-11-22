import { expect, test } from '@playwright/test'

test('offline restart, retry after lost acknowledgement, edits and delete', async ({
  page,
  context,
  request
}) => {
  const changes = async () => {
    const items: { resource_id: string; title: string; deleted: boolean }[] = []
    let cursor = 0
    for (;;) {
      const page = await (
        await request.get('/api/changes?after=' + cursor)
      ).json()
      items.push(...page.items)
      if (!page.more) return items
      cursor = page.cursor
    }
  }
  const name = 'Web ' + crypto.randomUUID()
  await page.goto('/')
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
    if (!navigator.serviceWorker.controller)
      await new Promise(r =>
        navigator.serviceWorker.addEventListener('controllerchange', r, {
          once: true
        })
      )
  })
  await context.setOffline(true)
  await page.getByRole('textbox', { name: 'New todo' }).fill(name)
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(page.getByText(name, { exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByText(name, { exact: true })).toBeVisible()
  let dropped = false
  await page.route('**/api/mutations', async route => {
    if (!dropped) {
      dropped = true
      await route.fetch()
      await route.abort()
      return
    }
    await route.continue()
  })
  await context.setOffline(false)
  await expect.poll(() => dropped).toBeTruthy()
  await page.getByRole('button', { name: 'Sync', exact: true }).click()
  await expect
    .poll(async () => {
      await page.getByRole('button', { name: 'Sync', exact: true }).click()
      return await page.getByRole('status').textContent()
    })
    .toBe('Up to date')
  const feed = await changes()
  const rows = feed.filter((t: { title: string }) => t.title === name)
  expect(rows).toHaveLength(1)
  const checkbox = page.getByRole('checkbox', { name: 'Complete ' + name })
  await checkbox.click()
  await expect(checkbox).toBeChecked()
  await page
    .getByRole('listitem')
    .filter({ hasText: name })
    .getByRole('button', { name: 'Edit', exact: true })
    .click()
  await page.getByRole('textbox', { name: 'Edit title' }).fill(name + ' edited')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  const row = page.getByRole('listitem').filter({ hasText: name + ' edited' })
  await expect(row).toBeVisible()
  await row.getByRole('button', { name: 'Delete' }).click()
  await expect(row).toHaveCount(0)
  await expect
    .poll(async () => {
      const data = await changes()
      return data
        .filter(
          (t: { resource_id: string }) => t.resource_id === rows[0].resource_id
        )
        .at(-1)?.deleted
    })
    .toBe(true)
})
