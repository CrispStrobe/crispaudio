/** Exercise recording through the transport; setup never starts capture itself. */
export async function recordingSetup(page){
 const dialog=page.getByRole('dialog',{name:'Record / takes',exact:true});if(!await dialog.isVisible())await page.getByRole('button',{name:'Recording settings',exact:true}).click();
 for(const section of ['input','options']){const details=dialog.locator(`[data-recording-section=${section}]`);if(await details.getAttribute('open')===null)await details.locator('summary').click();}return dialog;
}
export async function startCapture(page){
 const dialog=page.getByRole('dialog',{name:'Record / takes',exact:true});if(await dialog.isVisible())await dialog.getByRole('button',{name:'Close panel',exact:true}).click();await page.getByRole('button',{name:'Record',exact:true}).click();
}
