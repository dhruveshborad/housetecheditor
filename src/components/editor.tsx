'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import ImageExtension from '@tiptap/extension-image';
import UnderlineExtension from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import { useEditorStore } from '@/lib/store/editor-store';
import { BlockIdExtension } from '@/lib/editor/block-id-extension';
import { cn } from '@/lib/utils';
import { 
  Loader2, Bold, Italic, Underline, Strikethrough, 
  Heading1, Heading2, Heading3, Pilcrow, 
  List, ListOrdered, AlignLeft, AlignCenter, 
  AlignRight, Image as ImageIcon 
} from 'lucide-react';

interface EditorProps {
  documentId: string;
}

interface EditorToolbarProps {
  editor: any;
}

function EditorToolbar({ editor }: EditorToolbarProps) {
  if (!editor) return null;

  const addImage = () => {
    const url = window.prompt('Enter image URL:');
    if (url) {
      editor.chain().focus().setImage({ src: url }).run();
    }
  };

  const buttons = [
    // Typography Group
    {
      label: 'Paragraph',
      icon: Pilcrow,
      action: () => editor.chain().focus().setParagraph().run(),
      isActive: () => editor.isActive('paragraph'),
    },
    {
      label: 'Heading 1',
      icon: Heading1,
      action: () => editor.chain().focus().toggleHeading({ level: 1 }).run(),
      isActive: () => editor.isActive('heading', { level: 1 }),
    },
    {
      label: 'Heading 2',
      icon: Heading2,
      action: () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
      isActive: () => editor.isActive('heading', { level: 2 }),
    },
    {
      label: 'Heading 3',
      icon: Heading3,
      action: () => editor.chain().focus().toggleHeading({ level: 3 }).run(),
      isActive: () => editor.isActive('heading', { level: 3 }),
    },
    
    // Separator
    { type: 'separator' },

    // Formatting Group
    {
      label: 'Bold',
      icon: Bold,
      action: () => editor.chain().focus().toggleBold().run(),
      isActive: () => editor.isActive('bold'),
    },
    {
      label: 'Italic',
      icon: Italic,
      action: () => editor.chain().focus().toggleItalic().run(),
      isActive: () => editor.isActive('italic'),
    },
    {
      label: 'Underline',
      icon: Underline,
      action: () => editor.chain().focus().toggleUnderline().run(),
      isActive: () => editor.isActive('underline'),
    },
    {
      label: 'Strikethrough',
      icon: Strikethrough,
      action: () => editor.chain().focus().toggleStrike().run(),
      isActive: () => editor.isActive('strike'),
    },

    // Separator
    { type: 'separator' },

    // Lists Group
    {
      label: 'Bullet List',
      icon: List,
      action: () => editor.chain().focus().toggleBulletList().run(),
      isActive: () => editor.isActive('bulletList'),
    },
    {
      label: 'Ordered List',
      icon: ListOrdered,
      action: () => editor.chain().focus().toggleOrderedList().run(),
      isActive: () => editor.isActive('orderedList'),
    },

    // Separator
    { type: 'separator' },

    // Alignment Group
    {
      label: 'Align Left',
      icon: AlignLeft,
      action: () => editor.chain().focus().setTextAlign('left').run(),
      isActive: () => editor.isActive({ textAlign: 'left' }),
    },
    {
      label: 'Align Center',
      icon: AlignCenter,
      action: () => editor.chain().focus().setTextAlign('center').run(),
      isActive: () => editor.isActive({ textAlign: 'center' }),
    },
    {
      label: 'Align Right',
      icon: AlignRight,
      action: () => editor.chain().focus().setTextAlign('right').run(),
      isActive: () => editor.isActive({ textAlign: 'right' }),
    },

    // Separator
    { type: 'separator' },

    // Media Group
    {
      label: 'Insert Image',
      icon: ImageIcon,
      action: addImage,
      isActive: () => false,
    },
  ];

  return (
    <div className="flex flex-wrap items-center gap-1 p-1.5 rounded-xl bg-neutral-900/60 border border-neutral-800/80 backdrop-blur-md sticky top-0 z-30 shadow-lg mb-4">
      {buttons.map((btn, idx) => {
        if (btn.type === 'separator') {
          return <div key={`sep-${idx}`} className="w-px h-5 bg-neutral-800 mx-1 self-center" />;
        }

        const Icon = btn.icon!;
        const active = btn.isActive?.() ?? false;

        return (
          <button
            key={`btn-${idx}`}
            onClick={btn.action}
            type="button"
            title={btn.label}
            className={cn(
              "p-2 rounded-lg transition-all duration-150 flex items-center justify-center cursor-pointer",
              active 
                ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/10 scale-105" 
                : "text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/60"
            )}
          >
            <Icon className="h-4 w-4" />
          </button>
        );
      })}
    </div>
  );
}

export function Editor({ documentId }: EditorProps) {
  const {
    currentDocument,
    blocks,
    loadDocument,
    unloadDocument,
    insertBlock,
    updateBlock,
    deleteBlock,
    moveBlock,
  } = useEditorStore();

  const [loading, setLoading] = useState(true);
  const isUpdatingRef = useRef(false); // Prevents feedback loops
  const localUpdateCountRef = useRef(0); // Tracks pending local store updates

  const userRole = currentDocument?.userRole || 'OWNER';
  const isEditable = userRole !== 'VIEWER';

  // Initialize and load the document from local IndexedDB
  useEffect(() => {
    setLoading(true);
    loadDocument(documentId).then(() => {
      setLoading(false);
    });
    return () => {
      unloadDocument();
    };
  }, [documentId, loadDocument, unloadDocument]);

  // Convert store blocks to TipTap JSON structure
  const getEditorJsonFromBlocks = (blockList: typeof blocks) => {
    return {
      type: 'doc',
      content: blockList.map(b => {
        let contentArray = [];
        if (b.content) {
          try {
            contentArray = JSON.parse(b.content);
          } catch (e) {
            contentArray = [{ type: 'text', text: b.content }];
          }
        }
        return {
          type: b.type || 'paragraph',
          attrs: { 
            id: b.id,
            ...(b.attrs || {})
          },
          content: contentArray,
        };
      }),
    };
  };

  const editor = useEditor({
    editable: isEditable,
    extensions: [
      StarterKit.configure({
        // We handle bulletList/orderedList/codeBlock manually or let StarterKit do it,
        // but blockId will hook into all block types.
      }),
      Placeholder.configure({
        placeholder: 'Start writing something beautiful...',
      }),
      BlockIdExtension,
      UnderlineExtension,
      ImageExtension.configure({
        allowBase64: true,
      }),
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
    ],
    content: null,
    // Triggered on local keystrokes / edits
    onUpdate: ({ editor }) => {
      if (isUpdatingRef.current) return;

      isUpdatingRef.current = true;

      try {
        const json = editor.getJSON();
        const editorBlocks = (json.content || []).filter(node => node.attrs && node.attrs.id);

        const storeBlocks = blocks;
        const editorBlockIds = new Set(editorBlocks.map(b => b.attrs!.id));

        // 1. Process deletions (blocks in store but no longer in editor)
        for (const sBlock of storeBlocks) {
          if (!editorBlockIds.has(sBlock.id)) {
            localUpdateCountRef.current++;
            deleteBlock(sBlock.id).finally(() => {
              localUpdateCountRef.current--;
            });
          }
        }

        // 2. Process insertions, updates, and moves
        let lastId: string | null = null;
        for (let i = 0; i < editorBlocks.length; i++) {
          const eBlock = editorBlocks[i];
          const blockId = eBlock.attrs!.id;
          const blockType = eBlock.type || 'paragraph';
          const blockContent = JSON.stringify(eBlock.content || []);
          const { id, ...blockAttrs } = eBlock.attrs || {};
          const expectedPrevId = lastId;

          const sBlock = storeBlocks.find(b => b.id === blockId);

          if (!sBlock) {
            // It's a new block!
            localUpdateCountRef.current++;
            insertBlock(blockId, blockType, blockContent, expectedPrevId, blockAttrs).finally(() => {
              localUpdateCountRef.current--;
            });
          } else {
            // Existing block: check for content, type, or attributes updates
            const isContentDifferent = sBlock.content !== blockContent;
            const isTypeDifferent = sBlock.type !== blockType;
            const isAttrsDifferent = JSON.stringify(sBlock.attrs || {}) !== JSON.stringify(blockAttrs);

            if (isContentDifferent || isTypeDifferent || isAttrsDifferent) {
              localUpdateCountRef.current++;
              updateBlock(blockId, blockType, blockContent, blockAttrs).finally(() => {
                localUpdateCountRef.current--;
              });
            }
            // Check for moves (reordering)
            if (sBlock.prevId !== expectedPrevId) {
              localUpdateCountRef.current++;
              moveBlock(blockId, expectedPrevId).finally(() => {
                localUpdateCountRef.current--;
              });
            }
          }

          lastId = blockId;
        }
      } catch (err) {
        console.error('Error handling editor update:', err);
      } finally {
        isUpdatingRef.current = false;
      }
    },
  });

  // Keep the editor's editable state strictly synced with userRole
  useEffect(() => {
    if (editor) {
      editor.setEditable(isEditable);
    }
  }, [editor, isEditable]);

  // Sync editor with store blocks when store changes (e.g., remote sync edits)
  useEffect(() => {
    if (!editor || loading || !currentDocument) return;

    // If a local edit is currently updating the store, skip applying this 
    // update back to the editor, as the editor's local state is already newer.
    if (localUpdateCountRef.current > 0) {
      return;
    }

    // Check if editor content actually differs from store blocks
    const editorJson = editor.getJSON();
    const editorNodes = editorJson.content || [];
    
    let isDifferent = editorNodes.length !== blocks.length;

    if (!isDifferent) {
      for (let i = 0; i < blocks.length; i++) {
        const sBlock = blocks[i];
        const eNode = editorNodes[i];
        const eNodeContent = JSON.stringify(eNode.content || []);
        const { id, ...eNodeAttrs } = eNode.attrs || {};

        if (
          eNode.attrs?.id !== sBlock.id ||
          eNode.type !== sBlock.type ||
          eNodeContent !== sBlock.content ||
          JSON.stringify(sBlock.attrs || {}) !== JSON.stringify(eNodeAttrs)
        ) {
          isDifferent = true;
          break;
        }
      }
    }

    if (isDifferent) {
      // Prevent infinite loops by blocking the onUpdate hook
      isUpdatingRef.current = true;

      // Save cursor position details
      const { selection } = editor.state;
      const { anchor } = selection;

      // Find the ID and selection offset of the block that currently contains the cursor selection
      let activeBlockId: string | null = null;
      let selectionOffset = 0;
      editor.state.doc.descendants((node, pos) => {
        if (node.isBlock && anchor >= pos && anchor <= pos + node.nodeSize) {
          activeBlockId = node.attrs.id || null;
          selectionOffset = anchor - pos;
        }
      });

      // Update the editor's content
      const targetJson = getEditorJsonFromBlocks(blocks);
      editor.commands.setContent(targetJson, { emitUpdate: false });

      // Attempt to restore selection inside the same block node with character precision
      if (activeBlockId) {
        let newPos = -1;
        editor.state.doc.descendants((node, pos) => {
          if (node.attrs?.id === activeBlockId) {
            // Restore selection at the same offset, clamped to node size
            newPos = Math.min(pos + selectionOffset, pos + node.nodeSize - 1);
          }
        });

        if (newPos !== -1 && newPos >= 0 && newPos <= editor.state.doc.content.size) {
          try {
            editor.commands.setTextSelection(newPos);
          } catch (e) {
            // Ignore selection out of bounds or invalid states
          }
        }
      }

      isUpdatingRef.current = false;
    }
  }, [blocks, editor, loading, currentDocument]);

  if (loading || !editor) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-2 text-neutral-400">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
        <span className="text-sm font-medium">Loading document...</span>
      </div>
    );
  }

  return (
    <div className="w-full h-full min-h-[500px] bg-neutral-950/40 rounded-2xl border border-neutral-900 shadow-2xl backdrop-blur-md p-6 sm:p-8 flex flex-col">
      {/* Dynamic Toolbar */}
      {isEditable && (
        <EditorToolbar editor={editor} />
      )}

      {/* Editor Content Area */}
      <div className="prose prose-invert max-w-none focus:outline-none flex-1 min-h-[400px]">
        <EditorContent editor={editor} className="outline-none min-h-[380px]" />
      </div>
    </div>
  );
}
