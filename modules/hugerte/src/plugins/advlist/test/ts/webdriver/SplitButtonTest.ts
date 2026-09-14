import { RealMouse, UiFinder, Waiter } from '@ephox/agar';
import { describe, it } from '@ephox/bedrock-client';
import { SugarBody } from '@ephox/sugar';
import { TinyHooks } from '@ephox/wrap-mcagar';
import { assert } from 'chai';

import Editor from 'hugerte/core/api/Editor';
import AdvListPlugin from 'hugerte/plugins/advlist/Plugin';
import ListsPlugin from 'hugerte/plugins/lists/Plugin';

// This test uses real (WebDriver) mouse events so it exercises the same code path as a
// user in the browser. The synthetic events used by the headless toolbar test dispatch the
// click directly on the target element, which hides browser specific event retargeting
// (notably the Firefox behaviour that this test guards against).
describe('webdriver.hugerte.plugins.advlist.SplitButtonTest', () => {
  const hook = TinyHooks.bddSetup<Editor>({
    plugins: 'advlist lists',
    toolbar: 'numlist bullist',
    base_url: '/project/hugerte/js/hugerte'
  }, [ AdvListPlugin, ListsPlugin ], true);

  const mainSelector = 'div[aria-label="Bullet list"] .tox-split-button__main';
  const chevronSelector = 'div[aria-label="Bullet list"] .tox-split-button__chevron';

  it('TINY-8665: Real clicking the primary split button runs the action instead of opening the menu', async () => {
    const editor = hook.editor();
    editor.setContent('<p>hello</p>');
    editor.focus();

    // Clicking the primary button should toggle the list on, not open the dropdown
    await RealMouse.pClickOn(mainSelector);
    await Waiter.pTryUntil('The bullet list should have been created and no menu should be open', () => {
      assert.include(editor.getContent(), '<ul>', 'Expected the content to contain a bullet list');
      UiFinder.notExists(SugarBody.body(), '.tox-menu');
    });

    // Clicking the primary button while the cursor is in the list should cancel it
    await RealMouse.pClickOn(mainSelector);
    await Waiter.pTryUntil('The bullet list should have been cancelled', () => {
      assert.notInclude(editor.getContent(), '<ul>', 'Expected the bullet list to have been removed');
    });
  });

  it('TINY-8665: Real clicking the chevron opens the dropdown menu', async () => {
    const editor = hook.editor();
    editor.setContent('<p>hello</p>');
    editor.focus();

    await RealMouse.pClickOn(chevronSelector);
    await UiFinder.pWaitFor('The split button dropdown menu should be open', SugarBody.body(), '.tox-menu.tox-selected-menu');
  });
});
