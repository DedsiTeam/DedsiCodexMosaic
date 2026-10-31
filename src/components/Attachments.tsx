import { useEffect, useState } from "react";
import { File, X } from "lucide-react";
import { Dialog } from "@animate-ui/react/primitives/radix-ui/dialog";
import { readAttachment } from "../lib/client";
import type { Attachment } from "../lib/state";

export function AttachmentView({
  file,
  onRemove,
}: {
  file: Attachment;
  onRemove?: () => void;
}) {
  const [src, setSrc] = useState("");
  const [preview, setPreview] = useState(false);
  useEffect(() => {
    let active = true;
    let reader: FileReader | undefined;
    if (/^image\/(png|jpeg|webp|gif)$/.test(file.mime)) {
      void readAttachment(file.path)
        .then((bytes) => {
          if (!active) return;
          reader = new FileReader();
          reader.onload = () => {
            if (active) setSrc(String(reader?.result || ""));
          };
          reader.readAsDataURL(
            new Blob([new Uint8Array(bytes)], { type: file.mime }),
          );
        })
        .catch(() => {});
    }
    return () => {
      active = false;
      reader?.abort();
    };
  }, [file.path, file.mime]);
  return (
    <div className="attachment-chip">
      <button
        type="button"
        className="attachment-preview"
        onClick={() => src && setPreview(true)}
        title={file.name}
        aria-label={src ? `预览 ${file.name}` : file.name}
        disabled={!src}
      >
        {src ? <img src={src} alt={file.name} /> : <File size={20} />}
        <span>{file.name}</span>
      </button>
      {onRemove && (
        <button
          type="button"
          className="attachment-remove"
          aria-label={`移除 ${file.name}`}
          onClick={onRemove}
        >
          <X size={12} />
        </button>
      )}
      <Dialog.Root open={preview} onOpenChange={setPreview}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="dialog-content attachment-dialog">
            <Dialog.Title>{file.name}</Dialog.Title>
            <Dialog.Description>图片附件预览</Dialog.Description>
            <img src={src} alt={file.name} />
            <Dialog.Close type="button">关闭</Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
