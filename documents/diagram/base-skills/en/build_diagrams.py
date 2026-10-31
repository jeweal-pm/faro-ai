"""Build the proposed FaroAI Base Skills diagrams as SVG, PDF, HTML and draw.io.

English documentation generator only. Requires reportlab for embedded-font PDF output.
Run: python -B documents/diagram/base-skills/en/build_diagrams.py
"""
from pathlib import Path
from html import escape
import json
import xml.etree.ElementTree as ET
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.pagesizes import A3, landscape
from reportlab.lib.colors import HexColor

OUT = Path(__file__).resolve().parent
INK, MUTED = '#17324D', '#62758B'
BLUE, PALE_BLUE = '#6478F4', '#F0F2FF'
TEAL, PALE_TEAL = '#33AFA8', '#EAF8F6'
LINE, WHITE, PALE = '#D9E2EC', '#FFFFFF', '#F5F8FC'
AMBER, PALE_AMBER = '#BB7A16', '#FFF7E8'

font_pairs = [
    (Path('C:/Windows/Fonts/LeelawUI.ttf'), Path('C:/Windows/Fonts/LeelaUIb.ttf')),
    (Path('/usr/share/fonts/truetype/noto/NotoSansThai-Regular.ttf'), Path('/usr/share/fonts/truetype/noto/NotoSansThai-Bold.ttf')),
]
regular, bold = next(((a, b) for a, b in font_pairs if a.exists() and b.exists()), (None, None))
if regular is None:
    raise RuntimeError('Install a Thai font or configure font_pairs before building the PDF.')
pdfmetrics.registerFont(TTFont('DiagramThai', str(regular)))
pdfmetrics.registerFont(TTFont('DiagramThaiBold', str(bold)))


class Scene:
    def __init__(self, key, title, subtitle, height=1040):
        self.key, self.title, self.subtitle = key, title, subtitle
        self.w, self.h, self.ops = 1600, height, []
        self.rect(0, 0, self.w, self.h, WHITE, WHITE, 0)
        self.rect(0, 0, 800, 7, BLUE, BLUE, 0)
        self.rect(800, 0, 800, 7, TEAL, TEAL, 0)
        self.text(48, 46, 'FAROAI  /  PLATFORM BASE SKILLS', 15, MUTED, True)
        self.text(48, 94, title, 34, INK, True)
        self.text(48, 130, subtitle, 18, MUTED)
        self.text(48, self.h - 29, 'PROPOSED TARGET DESIGN  |  ADR-0036 / Draft SPEC  |  29 October 2026', 14, MUTED)
        self.text(self.w - 48, self.h - 29, key.upper(), 14, MUTED, anchor='end')

    def rect(self, x, y, w, h, fill=WHITE, stroke=LINE, radius=14, dash=False):
        self.ops.append(dict(kind='rect', x=x, y=y, w=w, h=h, fill=fill, stroke=stroke, radius=radius, dash=dash))

    def text(self, x, y, value, size=19, color=INK, bold=False, anchor='start'):
        value = value.replace('→', ' / ')
        self.ops.append(dict(kind='text', x=x, y=y, value=value, size=size, color=color, bold=bold, anchor=anchor))

    def line(self, points, color=MUTED, dash=False, arrow=True, width=2):
        self.ops.append(dict(kind='line', points=points, color=color, dash=dash, arrow=arrow, width=width))

    def box(self, x, y, w, h, title, details=(), new=False, fill=None, badge=None):
        color = BLUE if new else TEAL
        self.rect(x, y, w, h, fill or (PALE_BLUE if new else PALE_TEAL), color)
        self.text(x + 18, y + 33, title, 22, INK, True)
        for i, detail in enumerate(details):
            self.text(x + 18, y + 64 + i * 27, detail, 17, MUTED)
        if badge:
            self.text(x + w - 15, y + h - 14, badge, 12, color, True, 'end')

    def banner(self, y, title, body, color=TEAL, fill=PALE_TEAL):
        self.rect(48, y, 1504, 74, fill, color, 10)
        self.text(68, y + 28, title, 19, color, True)
        self.text(68, y + 55, body, 17, INK)

    def svg(self):
        items = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{self.w}" height="{self.h}" viewBox="0 0 {self.w} {self.h}" role="img" aria-label="{escape(self.title, quote=True)}">',
                 '<defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto-start-reverse"><path d="M0,0 L8,4 L0,8 Z" fill="#62758B"/></marker></defs>']
        for op in self.ops:
            if op['kind'] == 'rect':
                dash = ' stroke-dasharray="7 5"' if op['dash'] else ''
                items.append(f'<rect x="{op["x"]}" y="{op["y"]}" width="{op["w"]}" height="{op["h"]}" rx="{op["radius"]}" fill="{op["fill"]}" stroke="{op["stroke"]}" stroke-width="1.5"{dash}/>')
            elif op['kind'] == 'text':
                items.append(f'<text x="{op["x"]}" y="{op["y"]}" font-family="Leelawadee UI,Noto Sans Thai,Tahoma,sans-serif" font-size="{op["size"]}" font-weight="{700 if op["bold"] else 400}" fill="{op["color"]}" text-anchor="{op["anchor"]}">{escape(op["value"])}</text>')
            else:
                pts = ' '.join(f'{x},{y}' for x, y in op['points'])
                dash = ' stroke-dasharray="7 5"' if op['dash'] else ''
                arrow = ' marker-end="url(#arrow)"' if op['arrow'] else ''
                items.append(f'<polyline points="{pts}" fill="none" stroke="{op["color"]}" stroke-width="{op["width"]}"{dash}{arrow}/>')
        return '\n'.join(items + ['</svg>'])

    def pdf(self, pdf):
        page_w, page_h = landscape(A3)
        pad = 16
        scale = min((page_w - 2 * pad) / self.w, (page_h - 2 * pad) / self.h)
        ox, oy = (page_w - self.w * scale) / 2, (page_h - self.h * scale) / 2
        def xy(x, y):
            return ox + x * scale, oy + (self.h - y) * scale
        for op in self.ops:
            if op['kind'] == 'rect':
                x, y = xy(op['x'], op['y'] + op['h'])
                pdf.setFillColor(HexColor(op['fill'])); pdf.setStrokeColor(HexColor(op['stroke']))
                pdf.setLineWidth(1.3 * scale); pdf.setDash([7 * scale, 5 * scale] if op['dash'] else [])
                pdf.roundRect(x, y, op['w'] * scale, op['h'] * scale, op['radius'] * scale, stroke=1, fill=1)
            elif op['kind'] == 'text':
                x, y = xy(op['x'], op['y'])
                pdf.setFillColor(HexColor(op['color']))
                pdf.setFont('DiagramThaiBold' if op['bold'] else 'DiagramThai', op['size'] * scale)
                {'start': pdf.drawString, 'middle': pdf.drawCentredString, 'end': pdf.drawRightString}[op['anchor']](x, y, op['value'])
            else:
                import math
                pts = [xy(x, y) for x, y in op['points']]
                pdf.setStrokeColor(HexColor(op['color'])); pdf.setFillColor(HexColor(op['color']))
                pdf.setLineWidth(op['width'] * scale); pdf.setDash([7 * scale, 5 * scale] if op['dash'] else [])
                p = pdf.beginPath(); p.moveTo(*pts[0])
                for point in pts[1:]: p.lineTo(*point)
                pdf.drawPath(p)
                if op['arrow']:
                    a, b = pts[-2], pts[-1]; theta = math.atan2(b[1] - a[1], b[0] - a[0]); length = 9 * scale
                    p = pdf.beginPath(); p.moveTo(*b)
                    p.lineTo(b[0] - length * math.cos(theta - .40), b[1] - length * math.sin(theta - .40))
                    p.lineTo(b[0] - length * math.cos(theta + .40), b[1] - length * math.sin(theta + .40)); p.close()
                    pdf.drawPath(p, fill=1, stroke=0)
        pdf.showPage()


overview = Scene('01-overview', 'One Base Skill release for every tenant', 'Executive view: shared workflows with separate tenant data, permissions and budgets')
overview.box(48, 330, 210, 205, 'All tenants', ['Tenant A / B / C', 'Sales / Purchasing', 'Merchandising', 'Product discovery'], fill=PALE)
overview.box(315, 350, 235, 164, 'User prompt', ['Describe the task', 'No skill names needed', 'Use authorized data'])
overview.box(630, 320, 310, 226, 'FaroAI + Skill Runtime', ['Validate tenant / actor / budget', 'Jev selects skill and model', 'Load selected instructions', 'Executors enforce policy'], new=True, badge='Proposed runtime additions')
overview.box(600, 172, 365, 112, 'Shared Base Catalog', ['Jewelry/GIS + Analysis + Documents', 'One published release for all tenants'], new=True)
overview.line([(258, 432), (315, 432)])
overview.line([(550, 432), (630, 432)])
overview.line([(782, 284), (782, 320)], BLUE)
overview.box(1030, 185, 285, 138, 'Business data via MCP', ['Connected GIS / GMS / ERP', 'Scoped read/write tools', 'PO/receipt: preview + confirm'])
overview.box(1030, 372, 285, 112, 'Knowledge / Model', ['Tenant RAG + eligible models', 'Existing price caps and credits'])
overview.box(1030, 535, 285, 138, 'Analysis + Documents', ['Compute and build in workers', 'PDF / XLSX / DOCX / PPTX', 'Private tenant/actor files'], new=True)
overview.line([(940, 380), (982, 380), (982, 254), (1030, 254)])
overview.line([(940, 433), (1030, 433)])
overview.line([(940, 494), (982, 494), (982, 604), (1030, 604)], BLUE)
overview.rect(1360, 266, 192, 317, PALE, LINE)
overview.text(1380, 306, 'Usable results', 20, INK, True)
for i, value in enumerate(['Answers / products', 'Tables / calculations', 'Preview to confirm', 'Jobs / downloads']):
    overview.text(1380, 354 + i * 48, value, 17, MUTED)
overview.line([(1315, 254), (1340, 254), (1340, 340), (1360, 340)])
overview.line([(1315, 433), (1360, 433)])
overview.line([(1315, 604), (1340, 604), (1340, 535), (1360, 535)], BLUE)
overview.banner(728, 'Value to measure', 'Faster completed tasks  |  Less repeated prompting and rework  |  Measure cost per completed task')
overview.banner(820, 'Key policy', 'Base Skills do not merge tenant data or grant additional MCP or business-approval rights.', AMBER, PALE_AMBER)
overview.text(48, 953, 'Blue: proposed additions   •   Teal: existing capabilities reused/extended   •   Full scope delivered in phases', 16, MUTED)


def sequence(key, title, subtitle, participants, messages, bands=(), footer=None):
    s = Scene(key, title, subtitle, 1080)
    start, gap = 130, 268
    xs = {p[0]: start + i * gap for i, p in enumerate(participants)}
    for ident, label, new in participants:
        x = xs[ident]
        s.rect(x - 108, 178, 216, 63, PALE_BLUE if new else PALE_TEAL, BLUE if new else TEAL, 10)
        s.text(x, 216, label, 20, INK, True, 'middle')
        s.line([(x, 241), (x, 922)], LINE, True, False, 1.5)
    row_start, step = 280, 45
    for first, last, caption in bands:
        y = row_start + (first - 1) * step - 23
        s.rect(30, y, 1530, (last - first + 1) * step + 6, '#FAFBFE', LINE, 6)
        s.text(43, y + 19, caption, 13, MUTED, True)
    for n, (src, dst, label, response) in enumerate(messages, 1):
        x1, x2, y = xs[src], xs[dst], row_start + (n - 1) * step
        color = '#4053BF' if src in {'runtime', 'worker'} or dst in {'runtime', 'worker'} else INK
        if src == dst:
            s.line([(x1, y - 5), (x1 + 66, y - 5), (x1 + 66, y + 13), (x1, y + 13)], color, response)
            if x1 > 1000:
                s.text(x1 - 18, y + 3, f'{n}. {label}', 16, color, anchor='end')
            else:
                s.text(x1 + 80, y + 3, f'{n}. {label}', 16, color)
        else:
            s.line([(x1, y + 15), (x2, y + 15)], color, response)
            midpoint = (x1 + x2) / 2
            width = pdfmetrics.stringWidth(f'{n}. {label}', 'DiagramThai', 16)
            s.rect(midpoint - width / 2 - 7, y - 18, width + 14, 26, WHITE, WHITE, 2)
            s.text(midpoint, y + 5, f'{n}. {label}', 16, color, anchor='middle')
    if footer:
        s.banner(950, footer[0], footer[1], AMBER, PALE_AMBER)
    return s


routing_messages = [
    ('user', 'gateway', 'Summarize pending POs as Excel', False),
    ('gateway', 'gateway', 'Check tenant/scopes/budget', False),
    ('gateway', 'runtime', 'Request with trusted context', False),
    ('runtime', 'runtime', 'Resolve release + metadata', False),
    ('runtime', 'jev', 'Allowed skill/model choices', False),
    ('jev', 'runtime', 'Selected IDs or clarification', True),
    ('runtime', 'runtime', 'Validate IDs; load skill version', False),
    ('runtime', 'mcp', 'Check tool/schema; read POs', False),
    ('mcp', 'runtime', 'Verified data, rows and sources', True),
    ('runtime', 'model', 'If prose needed: skill + data', False),
    ('model', 'runtime', 'Draft for schema/fact validation', True),
    ('runtime', 'runtime', 'Persist job, then queue', False),
    ('runtime', 'gateway', 'Table + queued job ID', True),
    ('gateway', 'user', 'Show results; track the job', True),
]
routing = sequence('02-sequence-routing', 'Sequence 1/2: Select skills and read data', 'Composition-phase example: PO Search / Analysis / XLSX; no PO creation or approval',
    [('user', 'User', False), ('gateway', 'Web / Gateway', False), ('runtime', 'Skill Runtime', True), ('jev', 'Jev', False), ('model', 'Selected Model', False), ('mcp', 'GIS MCP', False)], routing_messages,
    footer=('Missing permission, model, tool or data', 'Stop before execution and explain or clarify. The model has no independent mutation authority.'))

artifact_messages = [
    ('worker', 'redis', 'Consume job ID from queue', False),
    ('redis', 'worker', 'Job ID only', True),
    ('worker', 'pg', 'Claim job; check tenant/version/policy', False),
    ('pg', 'worker', 'Job manifest + snapshot reference', True),
    ('worker', 'worker', 'Calculate, build XLSX, validate', False),
    ('worker', 'store', 'Save private file + content hash', False),
    ('store', 'worker', 'Artifact ID', True),
    ('worker', 'pg', 'Record completion + file metadata', False),
    ('user', 'gateway', 'Web app polls job status', False),
    ('gateway', 'pg', 'Read status by tenant/actor', False),
    ('pg', 'gateway', 'Authorized job result', True),
    ('gateway', 'user', 'Show downloadable file', True),
    ('user', 'gateway', 'Download by artifact ID', False),
    ('gateway', 'store', 'Check access/expiry; read file', False),
    ('store', 'user', 'Stream bytes through Gateway', True),
]
# File bytes flow through the gateway, never directly from private storage to the client.
artifact_messages[-1:] = [('store', 'gateway', 'File bytes', True), ('gateway', 'user', 'Stream file to user', True)]
# Keep the diagram at 15 messages: a queue response is not a separate business step.
artifact_messages.pop(1)
artifact = sequence('03-sequence-artifact', 'Sequence 2/2: Background jobs and private files', 'Continues from the queued job: PostgreSQL owns durable state; Redis coordinates delivery; Gateway serves downloads',
    [('user', 'User / Web app', False), ('gateway', 'Gateway', False), ('pg', 'PostgreSQL', False), ('redis', 'Redis Queue', False), ('worker', 'Artifact Worker', True), ('store', 'Private Storage', True)], artifact_messages,
    footer=('Read/artifact tasks and business writes have distinct policies', 'Catalog create retains direct policy; PO/receipt require preview / confirm / re-preview. No automatic training capture.'))

SCENES = [overview, routing, artifact]


def make_drawio(scenes):
    root = ET.Element('mxfile', host='app.diagrams.net', agent='FaroAI documentation', version='24.7.17')
    for scene in scenes:
        diagram = ET.SubElement(root, 'diagram', id=scene.key, name=scene.title)
        model = ET.SubElement(diagram, 'mxGraphModel', dx='1600', dy=str(scene.h), grid='1', gridSize='10', guides='1', page='1', pageScale='1', pageWidth='1600', pageHeight=str(scene.h))
        cells = ET.SubElement(model, 'root')
        ET.SubElement(cells, 'mxCell', id='0'); ET.SubElement(cells, 'mxCell', id='1', parent='0')
        for i, op in enumerate(scene.ops, 2):
            if i <= 4: continue
            ident = f'{scene.key}-{i}'
            if op['kind'] == 'rect':
                style = f'rounded={int(bool(op["radius"]))};whiteSpace=wrap;html=0;fillColor={op["fill"]};strokeColor={op["stroke"]};dashed={int(op["dash"])};'
                cell = ET.SubElement(cells, 'mxCell', id=ident, value='', style=style, vertex='1', parent='1')
                ET.SubElement(cell, 'mxGeometry', x=str(op['x']), y=str(op['y']), width=str(op['w']), height=str(op['h']), **{'as':'geometry'})
            elif op['kind'] == 'text':
                # Individual text elements remain fully editable in draw.io.
                font = 'DiagramThaiBold' if op['bold'] else 'DiagramThai'
                width = pdfmetrics.stringWidth(op['value'], font, op['size']) + 12
                x = op['x'] - (width / 2 if op['anchor']=='middle' else width if op['anchor']=='end' else 0)
                style = f'text;html=0;strokeColor=none;fillColor=none;align=left;verticalAlign=middle;fontFamily=Leelawadee UI;fontSize={op["size"]};fontColor={op["color"]};fontStyle={int(op["bold"])};whiteSpace=wrap;'
                cell=ET.SubElement(cells,'mxCell',id=ident,value=op['value'],style=style,vertex='1',parent='1')
                ET.SubElement(cell,'mxGeometry',x=str(x),y=str(op['y']-op['size']*1.05),width=str(width),height=str(op['size']*1.6),**{'as':'geometry'})
            else:
                style=f'edgeStyle=none;rounded=0;endArrow={"block" if op["arrow"] else "none"};endFill=1;strokeColor={op["color"]};strokeWidth={op["width"]};dashed={int(op["dash"])};'
                cell=ET.SubElement(cells,'mxCell',id=ident,value='',style=style,edge='1',parent='1')
                geo=ET.SubElement(cell,'mxGeometry',relative='1',**{'as':'geometry'})
                for key, point in [('sourcePoint',op['points'][0]),('targetPoint',op['points'][-1])]:
                    ET.SubElement(geo,'mxPoint',x=str(point[0]),y=str(point[1]),**{'as':key})
                if len(op['points'])>2:
                    array=ET.SubElement(geo,'Array',**{'as':'points'})
                    for x,y in op['points'][1:-1]: ET.SubElement(array,'mxPoint',x=str(x),y=str(y))
    ET.indent(root)
    return ET.tostring(root,encoding='unicode',xml_declaration=False)


overview_mermaid = '''flowchart LR
    tenants["All tenants"] --> prompt["Describe a task in FaroAI"]
    prompt --> gate["Gateway checks rights and budget"]
    gate --> runtime["Skill Runtime and Jev"]
    base["Shared Base Catalog: one inherited release"] --> runtime
    runtime --> business["Jewelry/GIS: approved MCP workflows"]
    runtime --> knowledge["Tenant RAG and eligible model"]
    runtime --> files["Data analysis and document worker"]
    business --> result["Answer, products, table, preview or file"]
    knowledge --> result
    files --> result
'''


def make_sequence_mermaid(title, participants, messages):
    lines=['sequenceDiagram',f'    title {title}']
    for p in participants: lines.append(f'    participant {p}')
    for source,target,label,response in messages:
        lines.append(f'    {source}{"-->>" if response else "->>"}{target}: {label}')
    return '\n'.join(lines)+'\n'


for scene in SCENES:
    (OUT/f'{scene.key}.svg').write_text(scene.svg(),encoding='utf-8')
(OUT/'base-skills.drawio').write_text(make_drawio(SCENES),encoding='utf-8')
(OUT/'01-overview.mmd').write_text(overview_mermaid,encoding='utf-8')
(OUT/'02-sequence-routing.mmd').write_text(make_sequence_mermaid(routing.title,['user','gateway','runtime','jev','model','mcp'],routing_messages),encoding='utf-8')
(OUT/'03-sequence-artifact.mmd').write_text(make_sequence_mermaid(artifact.title,['user','gateway','pg','redis','worker','store'],artifact_messages),encoding='utf-8')
pdf=canvas.Canvas(str(OUT/'faroai-base-skills-diagrams.pdf'),pagesize=landscape(A3))
pdf.setTitle('FaroAI Platform Base Skills - English Executive and Sequence Diagrams')
pdf.setAuthor('FaroAI - Proposed ADR-0036 - English edition')
for scene in SCENES: scene.pdf(pdf)
pdf.save()

sections=[]
for i,scene in enumerate(SCENES):
    sections.append(f'<section id="panel{i}" class="panel {"active" if i==0 else ""}"><div class="canvas">{scene.svg()}</div></section>')
html='''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>FaroAI Base Skills - Diagrams</title><style>
*{box-sizing:border-box}body{margin:0;background:#f4f7fc;color:#17324d;font-family:"Leelawadee UI",Tahoma,sans-serif}header{max-width:1500px;margin:24px auto 14px;padding:0 24px}h1{font-size:28px;margin:0 0 6px}p{margin:8px 0;line-height:1.6}.status{font-size:14px;color:#62758b}nav{display:flex;flex-wrap:wrap;gap:8px;margin:18px 0}button,a.action{border:1px solid #d9e2ec;border-radius:9px;padding:10px 16px;color:#17324d;background:white;text-decoration:none;cursor:pointer;font:inherit;font-size:14px}button[aria-selected=true]{background:#17324d;color:white}.toolbar{display:flex;gap:12px;align-items:center;flex-wrap:wrap}.panel{display:none;max-width:1550px;margin:16px auto 40px;padding:0 18px}.panel.active{display:block}.canvas{background:white;border:1px solid #d9e2ec;border-radius:16px;overflow:auto;box-shadow:0 12px 35px #17324d0a}.canvas svg{display:block;width:100%;height:auto;min-width:960px}.key{display:flex;gap:22px;font-size:14px;color:#62758b}.blue{color:#6478f4}.teal{color:#238f89}footer{max-width:1500px;margin:20px auto;padding:0 24px 30px;color:#62758b;font-size:14px}@media print{@page{size:A3 landscape;margin:8mm}header,footer{display:none}.panel{display:block!important;page-break-after:always;padding:0;margin:0}.panel:last-of-type{page-break-after:auto}.canvas{border:0;box-shadow:none;overflow:visible}.canvas svg{width:100%!important;min-width:0;max-height:275mm}}
</style><header><h1>FaroAI: Shared Base Skills for every tenant</h1><p class="status">Proposed design under ADR-0036 / Draft SPEC, 29 October 2026. Not a verified current deployment.</p>
<nav role="tablist"><button role="tab" aria-selected="true" data-tab="0">1. Executive overview</button><button role="tab" aria-selected="false" data-tab="1">2. Sequence: Skill selection</button><button role="tab" aria-selected="false" data-tab="2">3. Sequence: Artifact creation</button></nav>
<div class="toolbar"><button id="fit">Fit to view</button><button id="zoom">Zoom 150%</button><a class="action" href="faroai-base-skills-diagrams.pdf">Open three-page PDF</a><a class="action" href="base-skills.drawio" download>Editable draw.io source</a></div><p class="key"><span class="blue">Blue: proposed additions</span><span class="teal">Teal: existing capabilities reused/extended</span><span>Dashed sequence arrows: responses</span></p></header>'''+''.join(sections)+'''<footer>PO / Analysis / Excel illustrates the target composition phase and is read-only to GIS. Tenants inherit a shared skill release while data, permissions and files stay isolated. Jev selects allowed choices; Gateway and executors enforce policy.</footer>
<script>document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{document.querySelectorAll('[data-tab]').forEach(x=>x.setAttribute('aria-selected',String(x===b)));document.querySelectorAll('.panel').forEach((p,i)=>p.classList.toggle('active',i===Number(b.dataset.tab)))});document.getElementById('fit').onclick=()=>document.querySelectorAll('.canvas svg').forEach(s=>s.style.width='100%');document.getElementById('zoom').onclick=()=>document.querySelectorAll('.canvas svg').forEach(s=>s.style.width='150%');</script></html>'''
(OUT/'index.html').write_text(html,encoding='utf-8')
print(json.dumps({'pages':len(SCENES),'output':str(OUT),'pdf_bytes':(OUT/'faroai-base-skills-diagrams.pdf').stat().st_size}))
