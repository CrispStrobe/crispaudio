/** Open a tool through the same command search available in desktop and web. */
export async function timelineCommand(page, label) {
  await page.getByRole('button', {name: 'Find command', exact: true}).click();
  const dialog = page.getByRole('dialog', {name:'Find command',exact:true});
  await dialog.getByRole('textbox').fill(label);
  const name = new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
  await dialog.getByRole('button', {name}).click();
}
