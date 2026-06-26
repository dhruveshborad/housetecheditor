import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';

// Helper to generate UUIDs
function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export const BlockIdExtension = Extension.create({
  name: 'blockId',

  addGlobalAttributes() {
    return [
      {
        types: [
          'paragraph',
          'heading',
          'blockquote',
          'codeBlock',
          'bulletList',
          'orderedList',
          'listItem',
          'table',
          'tableRow',
          'tableHeader',
          'tableCell',
          'image',
        ],
        attributes: {
          id: {
            default: null,
            keepOnSplit: false, // Ensures new block gets a new ID, not the old split node ID
            rendered: true,
            parseHTML: element => element.getAttribute('data-block-id'),
            renderHTML: attributes => {
              if (!attributes.id) return {};
              return { 'data-block-id': attributes.id };
            },
          },
        },
      },
    ];
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('blockIdPlugin'),
        appendTransaction(transactions, oldState, newState) {
          // If the document hasn't changed structure, skip scanning
          if (!transactions.some(tr => tr.docChanged)) return null;

          let tr = newState.tr;
          let modified = false;

          // Scan all block nodes to ensure they have a unique ID
          newState.doc.descendants((node, pos) => {
            if (node.isBlock && node.type.name !== 'doc') {
              if (!node.attrs.id) {
                const newId = generateUUID();
                tr = tr.setNodeMarkup(pos, undefined, {
                  ...node.attrs,
                  id: newId,
                });
                modified = true;
              }
            }
          });

          return modified ? tr : null;
        },
      }),
    ];
  },
});
