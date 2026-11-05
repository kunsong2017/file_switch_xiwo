"""Build small original sample exams, including formula/image DOCX fixtures."""
from pathlib import Path
import io
import zipfile
from xml.sax.saxutils import escape
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parents[1]
out = root / 'public/examples'
fixtures = root / 'tests/fixtures'
out.mkdir(parents=True, exist_ok=True)
fixtures.mkdir(parents=True, exist_ok=True)
pdfmetrics.registerFont(UnicodeCIDFont('STSong-Light'))

questions = [
    ('1. 已知函数 f(x) = x² - 2x + 3，则最小值是（    ）。', ['A. 1        B. 2        C. 3        D. 4']),
    ('2. 如图，直角三角形两直角边分别为 3 和 4，求斜边长。', ['请写出计算过程。']),
    ('3. 解方程：2x + 5 = 17。', ['（1）写出移项过程。', '（2）检验方程的解。']),
    ('4. 某班 40 人，喜欢阅读的有 28 人，占全班的百分之几？', ['请列式计算，并说明思路。']),
    ('5. 计算下面各式。', ['（1）3/4 + 1/2       （2）(2 + 3) × 4', '（3）36 ÷ 6 + 5']),
    ('6. 小明骑车 30 分钟行驶了 9 千米，平均速度是多少？', ['（1）换算时间单位。', '（2）用千米/小时表示速度。']),
]

pdf = canvas.Canvas(str(out / '数学示例试卷.pdf'), pagesize=(595,842))
pdf.setTitle('题页 · 数学示例试卷')
for page in range(2):
    pdf.setFont('STSong-Light', 21)
    pdf.setFillColorRGB(.2,.27,.18)
    pdf.drawString(55,780,'数学 · 课堂练习')
    pdf.setFont('STSong-Light',10)
    pdf.setFillColorRGB(.5,.55,.45)
    pdf.drawString(55,754,'题页原创示例   姓名：__________    班级：__________')
    pdf.setStrokeColorRGB(.8,.85,.74)
    pdf.line(55,740,540,740)
    for qi in range(3):
        stem, lines = questions[page * 3 + qi]
        y = 700 - qi * 204
        pdf.setFont('STSong-Light',13)
        pdf.setFillColorRGB(.12,.15,.1)
        pdf.drawString(55,y,stem)
        pdf.setFont('STSong-Light',12)
        for li, text in enumerate(lines):
            pdf.drawString(65,y-31-li*28,text)
        if page == 0 and qi == 1:
            pdf.setStrokeColorRGB(.3,.4,.24)
            pdf.line(370,y-40,370,y-135)
            pdf.line(370,y-135,495,y-135)
            pdf.line(495,y-135,370,y-40)
            pdf.line(370,y-125,380,y-125)
            pdf.line(380,y-125,380,y-135)
            pdf.drawString(351,y-92,'3')
            pdf.drawString(430,y-153,'4')
    pdf.setFont('STSong-Light',9)
    pdf.setFillColorRGB(.6,.65,.55)
    pdf.drawString(55,32,'示例内容仅用于体验试卷分题转换')
    pdf.drawRightString(540,32,f'{page+1} / 2')
    pdf.showPage()
pdf.save()

image = Image.new('RGB',(400,240),'white')
draw = ImageDraw.Draw(image)
draw.line([(60,20),(60,200),(330,200),(60,20)],fill='#506640',width=4)
draw.line([(60,184),(76,184),(76,200)],fill='#506640',width=2)
buffer = io.BytesIO()
image.save(buffer,format='PNG')

W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
M = 'http://schemas.openxmlformats.org/officeDocument/2006/math'
def para(text, numbered=False, size=25):
    props = '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>' if numbered else ''
    return f'<w:p><w:pPr>{props}<w:spacing w:after="180"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Arial" w:eastAsia="Noto Sans CJK SC"/><w:sz w:val="{size}"/></w:rPr><w:t xml:space="preserve">{escape(text)}</w:t></w:r></w:p>'

formula = '''<w:p><m:oMath><m:f><m:num><m:r><m:t>3</m:t></m:r></m:num><m:den><m:r><m:t>4</m:t></m:r></m:den></m:f><m:r><m:t> + </m:t></m:r><m:f><m:num><m:r><m:t>1</m:t></m:r></m:num><m:den><m:r><m:t>2</m:t></m:r></m:den></m:f></m:oMath></w:p>'''
drawing = '''<w:p><w:r><w:drawing><wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><wp:extent cx="3048000" cy="1828800"/><wp:docPr id="1" name="triangle"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="1" name="triangle.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rIdImage"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="3048000" cy="1828800"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>'''

def make_docx(path, automatic=False, long=False):
    body = para('数学 · 课堂练习',size=38)
    body += para('题页原创示例  姓名：__________  班级：__________',size=20)
    for i,(stem, lines) in enumerate(questions):
        if i == 3 and not long:
            body += '<w:p><w:r><w:br w:type="page"/></w:r></w:p>'
        body += para(stem.split('. ',1)[1] if automatic else stem,numbered=automatic)
        for text in lines:
            body += para(text)
        if i == 1:
            body += drawing
        if i == 4:
            body += formula
        if long:
            for n in range(12):
                body += para(f'解题思考与说明，第 {n+1} 行：请保留推导过程，仔细核对题目条件。')
        body += para('答：________________________________________________________________',size=22)
    section = '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1000" w:right="900" w:bottom="1000" w:left="900"/></w:sectPr>'
    document = f'<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="{W}" xmlns:m="{M}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>{body}{section}</w:body></w:document>'
    types = '''<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/></Types>'''
    rels = '''<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'''
    word_rels = '''<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdImage" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/triangle.png"/><Relationship Id="rIdNumbering" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/></Relationships>'''
    numbering = f'''<w:numbering xmlns:w="{W}"><w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/><w:suff w:val="space"/><w:pPr><w:ind w:left="0" w:hanging="0"/></w:pPr></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>'''
    with zipfile.ZipFile(path,'w',zipfile.ZIP_DEFLATED) as z:
        for name,content in [('[Content_Types].xml',types),('_rels/.rels',rels),('word/document.xml',document),('word/_rels/document.xml.rels',word_rels),('word/numbering.xml',numbering),('word/media/triangle.png',buffer.getvalue())]:
            z.writestr(name,content)

make_docx(out / '数学示例试卷.docx')
make_docx(fixtures / 'automatic-numbering.docx',automatic=True)
make_docx(fixtures / 'long-document.docx',long=True)
print('Created PDF, DOCX, image/formula, automatic-numbering and long-document fixtures.')
