"use client";
import { useState } from "react";

type Props = {
  post: { id: string; title: string; description: string; hashtags: string[]; status: string };
  scheduledLocal: string;
  titleMax: number | null;
  captionMax: number;
  maxHashtags: number;
  editable: boolean;
  labels: { title: string; description: string; hashtags: string; scheduledAt: string; save: string };
  action: (f: FormData) => void;
};

/** Live counters mirror composeCaption(): platforms without a title field count title + description + hashtags. */
export function PostEditor({ post, scheduledLocal, titleMax, captionMax, maxHashtags, editable, labels, action }: Props) {
  const [title, setTitle] = useState(post.title);
  const [desc, setDesc] = useState(post.description);
  const [tags, setTags] = useState(post.hashtags.map((h) => `#${h}`).join(" "));
  const tagList = tags.split(/[\s,]+/).map((x) => x.replace(/^#/, "")).filter(Boolean);
  const tagStr = tagList.map((h) => `#${h}`).join(" ");
  const caption = (titleMax === null ? [title, desc, tagStr] : [desc, tagStr]).filter((x) => x.trim()).join("\n\n");

  return (
    <form action={action} className="stack">
      <input type="hidden" name="postId" value={post.id} />
      <label className="field">
        {labels.title}
        <input type="text" name="title" value={title} onChange={(e) => setTitle(e.target.value)} disabled={!editable} />
        {titleMax !== null && <span className={`counter ${title.length > titleMax ? "over" : ""}`}>{title.length}/{titleMax}</span>}
      </label>
      <label className="field">
        {labels.description}
        <textarea name="description" value={desc} onChange={(e) => setDesc(e.target.value)} disabled={!editable} />
        <span className={`counter ${caption.length > captionMax ? "over" : ""}`}>{caption.length}/{captionMax}</span>
      </label>
      <label className="field">
        {labels.hashtags}
        <input type="text" name="hashtags" value={tags} onChange={(e) => setTags(e.target.value)} disabled={!editable} />
        <span className={`counter ${tagList.length > maxHashtags ? "over" : ""}`}>{tagList.length}/{maxHashtags}</span>
      </label>
      <label className="field">
        {labels.scheduledAt}
        <input type="datetime-local" name="scheduledAt" defaultValue={scheduledLocal} disabled={!editable} />
      </label>
      {editable && <div><button className="btn">{labels.save}</button></div>}
    </form>
  );
}
