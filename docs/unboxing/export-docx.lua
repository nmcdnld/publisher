-- pandoc -f html -t docx --lua-filter export-docx.lua; flattens the
-- CSS-only layouts in index.html / credible-demo.html into plain Word blocks.

local function has(el, cls)
  return el.classes and el.classes:includes(cls)
end

-- "**Title**rest" -> "**Title** — rest"
local function title_dash(inlines)
  local out = pandoc.List()
  for i, x in ipairs(inlines) do
    out:insert(x)
    if i == 1 and x.t == "Strong" and inlines[2] then
      out:insert(pandoc.Str(" —"))
      out:insert(pandoc.Space())
    end
  end
  return out
end

local function inlines_of(blocks)
  local out = pandoc.List()
  for _, b in ipairs(blocks) do
    if b.content and (b.t == "Para" or b.t == "Plain") then
      if #out > 0 then out:insert(pandoc.Space()) end
      out:extend(b.content)
    end
  end
  return out
end

function Span(el)
  if has(el, "num") then
    local c = el.content:clone()
    c:insert(pandoc.Space())
    return c
  end
  if has(el, "tag") then
    local c = pandoc.List({ pandoc.Space(), pandoc.Str("(") })
    c:extend(el.content)
    c:insert(pandoc.Str(")"))
    return pandoc.Emph(c)
  end
end

function Div(el)
  if has(el, "flow") then
    local items = pandoc.List()
    for _, n in ipairs(el.content) do
      if n.t == "Div" and has(n, "node") then
        items:insert({ pandoc.Plain(title_dash(inlines_of(n.content))) })
      end
    end
    return pandoc.OrderedList(items)
  end

  if has(el, "loop") then
    local items = pandoc.List()
    for _, n in ipairs(el.content) do
      if n.t == "Div" and has(n, "node") then
        local step, body = pandoc.List(), pandoc.List()
        for _, b in ipairs(n.content) do
          if b.t == "Div" and has(b, "step") then
            step = inlines_of(b.content)
          elseif b.content then
            body:extend(b.content)
          end
        end
        local line = pandoc.List()
        line:extend(step)
        if has(n, "future") then line:insert(pandoc.Emph({ pandoc.Str(" (future)") })) end
        line:insert(pandoc.Str(":"))
        line:insert(pandoc.Space())
        line:extend(title_dash(body))
        items:insert({ pandoc.Plain(line) })
      end
    end
    return pandoc.BulletList(items)
  end

  if has(el, "loop-back") then
    return pandoc.Para({ pandoc.Emph(inlines_of(el.content)) })
  end

  if has(el, "stats") then
    local items = pandoc.List()
    for _, n in ipairs(el.content) do
      if n.t == "Div" then
        local ins = inlines_of(n.content)
        if ins[1] and ins[1].t == "Strong" then ins:insert(2, pandoc.Space()) end
        items:insert({ pandoc.Plain(ins) })
      end
    end
    return pandoc.BulletList(items)
  end

  if has(el, "ed") then
    local blocks = el.content:clone()
    if blocks[1] and blocks[1].content then
      blocks[1].content:insert(1, pandoc.Space())
      blocks[1].content:insert(1, pandoc.Strong({ pandoc.Str("Editor:") }))
    end
    return pandoc.BlockQuote(blocks)
  end

  if has(el, "callout") then
    return pandoc.BlockQuote(el.content)
  end

  if has(el, "series-foot") then
    local label, colophon, parts = pandoc.List(), pandoc.List(), {}
    for _, b in ipairs(el.content) do
      if b.t == "Div" and has(b, "label") then
        label = inlines_of(b.content)
      elseif b.t == "Div" and has(b, "colophon") then
        colophon = inlines_of(b.content)
      elseif b.content then
        pandoc.walk_block(b, {
          Span = function(s)
            for _, cls in ipairs({ "eyebrow", "title", "blurb" }) do
              if has(s, cls) then parts[cls] = s.content end
            end
          end,
        })
      end
    end
    local head = pandoc.List({ pandoc.Strong(label), pandoc.Str(":"), pandoc.Space() })
    head:extend(parts.eyebrow or {})
    head:extend({ pandoc.Space(), pandoc.Str("—"), pandoc.Space(), pandoc.Strong(parts.title or {}) })
    return {
      pandoc.HorizontalRule(),
      pandoc.Para(head),
      pandoc.Para(parts.blurb or {}),
      pandoc.Para({ pandoc.Emph(colophon) }),
    }
  end

  if has(el, "kicker") or has(el, "byline") then
    return pandoc.Para({ pandoc.Emph(inlines_of(el.content)) })
  end
end