import { useCallback, useEffect, useState } from "react";
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
  const [zoom, setZoom] = useState(1);
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const viewport = useCallback((element: HTMLDivElement | null) => {
    if (!element) return;
    const observer = new ResizeObserver(() => {
      setViewportSize({ width: element.clientWidth, height: element.clientHeight });
    });
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? element.clientHeight : 1);
      setZoom((value) => Math.max(0.25, Math.min(8, value * Math.exp(-Math.max(-100, Math.min(100, delta)) * 0.002))));
    };
    observer.observe(element);
    element.addEventListener("wheel", wheel, { passive: false });
    return () => {
      observer.disconnect();
      element.removeEventListener("wheel", wheel);
    };
  }, []);
  const fitScale = imageSize.width && imageSize.height && viewportSize.width && viewportSize.height
    ? Math.min(viewportSize.width / imageSize.width, viewportSize.height / imageSize.height)
    : 1;
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
        onClick={() => { if (src) { setZoom(1); setPreview(true); } }}
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
      <Dialog.Root open={preview} onOpenChange={(open) => { setPreview(open); if (open) setZoom(1); }}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="dialog-content attachment-dialog">
            <div className="attachment-dialog-header">
              <Dialog.Title>{file.name}</Dialog.Title>
              <Dialog.Close type="button">关闭</Dialog.Close>
            </div>
            <Dialog.Description hidden>图片附件预览，鼠标滚轮向上放大、向下缩小。</Dialog.Description>
            <div className="attachment-image-viewport" ref={viewport}>
              <img
                src={src}
                alt={file.name}
                onLoad={(event) => setImageSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })}
                style={imageSize.width ? { width: imageSize.width * fitScale * zoom, height: imageSize.height * fitScale * zoom } : undefined}
              />
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
