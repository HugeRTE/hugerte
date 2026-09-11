import { RealKeys, Waiter } from '@ephox/agar';
import { describe, it } from '@ephox/bedrock-client';
import { Arr } from '@ephox/katamari';
import { TinyAssertions, TinyHooks, TinySelections } from '@ephox/wrap-mcagar';
import { assert } from 'chai';

import Editor from 'hugerte/core/api/Editor';
import Plugin from 'hugerte/plugins/visualchars/Plugin';

Arr.each([ false, true ], (inline) => {
  describe('webdriver.hugerte.plugins.visualchars.TypingTest (inline: ' + inline + ')', () => {
    const hook = TinyHooks.bddSetupLight<Editor>({
      inline,
      plugins: 'visualchars',
      visualchars_default_state: true,
      base_url: '/project/hugerte/js/hugerte'
    }, [ Plugin ]);

    it('Normalize a trailing space when typing resumes after visualchars wraps it', async () => {
      const editor = hook.editor();
      editor.setContent('<p></p>');
      editor.focus();
      TinySelections.setCursor(editor, [ 0 ], 0);
      const selector = inline ? '.mce-content-body' : 'iframe => body';
      await RealKeys.pSendKeysOn(selector, [ RealKeys.text('word ') ]);
      await Waiter.pTryUntil('Wait for the trailing space to be wrapped', () => {
        TinyAssertions.assertContentPresence(editor, { 'span.mce-nbsp': 1 });
      });
      await RealKeys.pSendKeysOn(selector, [ RealKeys.text('word2') ]);
      assert.equal(editor.getBody().textContent, 'word word2');
      TinyAssertions.assertContent(editor, '<p>word word2</p>');
    });
  });
});
