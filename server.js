const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const sharp = require('sharp');
const mime = require('mime-types');

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// uploads 디렉토리와 하위 폴더들 생성
const uploadsDir = path.join(__dirname, 'uploads');
const markdownDir = path.join(uploadsDir, 'markdown');
const imagesDir = path.join(uploadsDir, 'images');
const thumbnailsDir = path.join(uploadsDir, 'thumbnails');
const groupsDir = path.join(uploadsDir, 'groups');
const tempDir = path.join(uploadsDir, 'temp');

[uploadsDir, markdownDir, imagesDir, thumbnailsDir, groupsDir, tempDir].forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

// 파일 타입 감지 함수
function getFileType(filename) {
    const ext = path.extname(filename).toLowerCase();
    if (['.md', '.markdown'].includes(ext)) return 'markdown';
    if (['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'].includes(ext)) return 'image';
    return 'unknown';
}

// 그룹 메타데이터 생성
function createGroupMetadata(groupId, groupName) {
    return {
        id: groupId,
        name: groupName,
        createdAt: new Date().toISOString(),
        completedAt: null,
        isCompleted: false,
        files: []
    };
}

// 그룹 메타데이터 읽기
async function readGroupMetadata(groupId) {
    try {
        const metadataPath = path.join(groupsDir, groupId, 'metadata.json');
        const data = await fs.promises.readFile(metadataPath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        return null;
    }
}

// 그룹 메타데이터 저장
async function saveGroupMetadata(groupId, metadata) {
    try {
        const metadataPath = path.join(groupsDir, groupId, 'metadata.json');
        await fs.promises.writeFile(metadataPath, JSON.stringify(metadata, null, 2));
        return true;
    } catch (error) {
        console.error('메타데이터 저장 실패:', error);
        return false;
    }
}

// 그룹 디렉토리 생성
async function createGroupDirectories(groupId) {
    const groupPath = path.join(groupsDir, groupId);
    const filesPath = path.join(groupPath, 'files');
    const thumbnailsPath = path.join(groupPath, 'thumbnails');

    try {
        await fs.promises.mkdir(groupPath, { recursive: true });
        await fs.promises.mkdir(filesPath, { recursive: true });
        await fs.promises.mkdir(thumbnailsPath, { recursive: true });
        return true;
    } catch (error) {
        console.error('그룹 디렉토리 생성 실패:', error);
        return false;
    }
}

// Multer 설정 - 파일 업로드 처리
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        // 그룹 기반 업로드의 경우 임시 폴더 사용
        cb(null, tempDir);
    },
    filename: function (req, file, cb) {
        // 한글 파일명 지원을 위해 Buffer 사용
        const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
        const uniqueName = Date.now() + '-' + originalName;
        cb(null, uniqueName);
    }
});

const upload = multer({
    storage: storage,
    fileFilter: function (req, file, cb) {
        const fileType = getFileType(file.originalname);
        if (fileType === 'unknown') {
            return cb(new Error('마크다운 파일(.md, .markdown) 또는 이미지 파일(.jpg, .png, .gif, .webp, .svg)만 업로드 가능합니다.'));
        }
        cb(null, true);
    },
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB 제한
    }
});

// 썸네일 생성 함수
async function generateThumbnail(imagePath, thumbnailPath) {
    try {
        await sharp(imagePath)
            .resize(200, 200, { fit: 'cover', position: 'center' })
            .jpeg({ quality: 80 })
            .toFile(thumbnailPath);
        return true;
    } catch (error) {
        console.error('썸네일 생성 실패:', error);
        return false;
    }
}

// 라우트: 파일 업로드
app.post('/api/upload', upload.single('file'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: '파일이 업로드되지 않았습니다.' });
    }

    const fileType = getFileType(req.file.originalname);
    const originalName = Buffer.from(req.file.originalname, 'latin1').toString('utf8');

    // 이미지 파일인 경우 썸네일 생성
    if (fileType === 'image') {
        const imagePath = req.file.path;
        const thumbnailName = req.file.filename.replace(/\.[^/.]+$/, '.jpg');
        const thumbnailPath = path.join(thumbnailsDir, thumbnailName);

        await generateThumbnail(imagePath, thumbnailPath);
    }

    res.json({
        message: '파일이 성공적으로 업로드되었습니다.',
        filename: req.file.filename,
        originalName: originalName,
        fileType: fileType
    });
});

// 라우트: 새 그룹 생성
app.post('/api/groups', async (req, res) => {
    try {
        const groupId = `group-${Date.now()}`;
        const groupName = req.body.name || `새 그룹 ${new Date().toLocaleDateString('ko-KR')}`;

        // 그룹 디렉토리 생성
        const created = await createGroupDirectories(groupId);
        if (!created) {
            return res.status(500).json({ error: '그룹 생성에 실패했습니다.' });
        }

        // 메타데이터 생성 및 저장
        const metadata = createGroupMetadata(groupId, groupName);
        const saved = await saveGroupMetadata(groupId, metadata);

        if (!saved) {
            return res.status(500).json({ error: '메타데이터 저장에 실패했습니다.' });
        }

        res.json({
            message: '그룹이 성공적으로 생성되었습니다.',
            group: metadata
        });
    } catch (error) {
        console.error('그룹 생성 오류:', error);
        res.status(500).json({ error: '그룹 생성 중 오류가 발생했습니다.' });
    }
});


// 라우트: 그룹 완료
app.put('/api/groups/:groupId/complete', async (req, res) => {
    try {
        const groupId = req.params.groupId;
        const metadata = await readGroupMetadata(groupId);

        if (!metadata) {
            return res.status(404).json({ error: '그룹을 찾을 수 없습니다.' });
        }

        metadata.isCompleted = true;
        metadata.completedAt = new Date().toISOString();

        if (req.body.name) {
            metadata.name = req.body.name;
        }

        await saveGroupMetadata(groupId, metadata);

        res.json({
            message: '그룹이 완료되었습니다.',
            group: metadata
        });
    } catch (error) {
        console.error('그룹 완료 오류:', error);
        res.status(500).json({ error: '그룹 완료 중 오류가 발생했습니다.' });
    }
});

// 라우트: 그룹명 수정
app.put('/api/groups/:groupId/name', async (req, res) => {
    try {
        const groupId = req.params.groupId;
        const { name } = req.body;

        if (!name) {
            return res.status(400).json({ error: '그룹명이 필요합니다.' });
        }

        const metadata = await readGroupMetadata(groupId);
        if (!metadata) {
            return res.status(404).json({ error: '그룹을 찾을 수 없습니다.' });
        }

        metadata.name = name;
        await saveGroupMetadata(groupId, metadata);

        res.json({
            message: '그룹명이 수정되었습니다.',
            group: metadata
        });
    } catch (error) {
        console.error('그룹명 수정 오류:', error);
        res.status(500).json({ error: '그룹명 수정 중 오류가 발생했습니다.' });
    }
});

// 라우트: 그룹 목록 조회
app.get('/api/groups', async (req, res) => {
    try {
        const groups = [];
        const groupFolders = await fs.promises.readdir(groupsDir).catch(() => []);

        for (const folder of groupFolders) {
            const metadata = await readGroupMetadata(folder);
            if (metadata && metadata.isCompleted) {
                // 썸네일 정보 추가
                const firstImage = metadata.files.find(file => file.fileType === 'image');
                if (firstImage && firstImage.thumbnail) {
                    metadata.thumbnail = `/api/groups/${folder}/thumbnails/${firstImage.thumbnail}`;
                }

                groups.push(metadata);
            }
        }

        // 최신순으로 정렬
        groups.sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt));

        res.json(groups);
    } catch (error) {
        console.error('그룹 목록 조회 오류:', error);
        res.status(500).json({ error: '그룹 목록을 불러올 수 없습니다.' });
    }
});

// 라우트: 그룹 상세 조회
app.get('/api/groups/:groupId', async (req, res) => {
    try {
        const groupId = req.params.groupId;
        const metadata = await readGroupMetadata(groupId);

        if (!metadata) {
            return res.status(404).json({ error: '그룹을 찾을 수 없습니다.' });
        }

        res.json(metadata);
    } catch (error) {
        console.error('그룹 조회 오류:', error);
        res.status(500).json({ error: '그룹을 조회할 수 없습니다.' });
    }
});

// 라우트: 파일 목록 조회 (기존 파일들 - 호환성용)
app.get('/api/files', async (req, res) => {
    try {
        const allFiles = [];

        // 마크다운 파일 스캔
        const markdownFiles = await fs.promises.readdir(markdownDir).catch(() => []);
        for (const file of markdownFiles) {
            const stats = await fs.promises.stat(path.join(markdownDir, file));
            allFiles.push({
                filename: file,
                displayName: file.replace(/^\d+-/, ''),
                uploadDate: stats.birthtime,
                size: stats.size,
                fileType: 'markdown',
                folder: 'markdown'
            });
        }

        // 이미지 파일 스캔
        const imageFiles = await fs.promises.readdir(imagesDir).catch(() => []);
        for (const file of imageFiles) {
            const stats = await fs.promises.stat(path.join(imagesDir, file));
            const thumbnailName = file.replace(/\.[^/.]+$/, '.jpg');
            const thumbnailExists = fs.existsSync(path.join(thumbnailsDir, thumbnailName));

            allFiles.push({
                filename: file,
                displayName: file.replace(/^\d+-/, ''),
                uploadDate: stats.birthtime,
                size: stats.size,
                fileType: 'image',
                folder: 'images',
                thumbnail: thumbnailExists ? thumbnailName : null
            });
        }

        // 최신 파일이 먼저 오도록 정렬
        allFiles.sort((a, b) => b.uploadDate - a.uploadDate);

        res.json(allFiles);
    } catch (error) {
        console.error('파일 목록 조회 오류:', error);
        res.status(500).json({ error: '파일 목록을 읽을 수 없습니다.' });
    }
});

// 라우트: 파일 내용 조회
app.get('/api/files/:folder/:filename', (req, res) => {
    const folder = req.params.folder;
    const filename = req.params.filename;
    const filepath = path.join(uploadsDir, folder, filename);

    // 보안을 위해 경로 검증
    if (!filepath.startsWith(uploadsDir)) {
        return res.status(403).json({ error: '접근이 금지되었습니다.' });
    }

    const fileType = getFileType(filename);

    if (fileType === 'image') {
        // 이미지 파일인 경우 바이너리로 서빙
        const mimeType = mime.lookup(filename) || 'application/octet-stream';

        fs.readFile(filepath, (err, data) => {
            if (err) {
                if (err.code === 'ENOENT') {
                    return res.status(404).json({ error: '파일을 찾을 수 없습니다.' });
                }
                return res.status(500).json({ error: '파일을 읽을 수 없습니다.' });
            }

            res.set('Content-Type', mimeType);
            res.send(data);
        });
    } else {
        // 마크다운 파일인 경우 텍스트로 반환
        fs.readFile(filepath, 'utf8', (err, content) => {
            if (err) {
                if (err.code === 'ENOENT') {
                    return res.status(404).json({ error: '파일을 찾을 수 없습니다.' });
                }
                return res.status(500).json({ error: '파일을 읽을 수 없습니다.' });
            }

            res.json({
                filename: filename,
                displayName: filename.replace(/^\d+-/, ''),
                content: content,
                fileType: fileType
            });
        });
    }
});

// 라우트: 썸네일 이미지 서빙
app.get('/api/thumbnails/:filename', (req, res) => {
    const filename = req.params.filename;
    const filepath = path.join(thumbnailsDir, filename);

    // 보안을 위해 경로 검증
    if (!filepath.startsWith(thumbnailsDir)) {
        return res.status(403).json({ error: '접근이 금지되었습니다.' });
    }

    res.sendFile(filepath, (err) => {
        if (err) {
            res.status(404).json({ error: '썸네일을 찾을 수 없습니다.' });
        }
    });
});

// 라우트: 그룹 파일 서빙
app.get('/api/groups/:groupId/files/:filename', (req, res) => {
    const groupId = req.params.groupId;
    const filename = req.params.filename;
    const filepath = path.join(groupsDir, groupId, 'files', filename);

    // 보안을 위해 경로 검증
    const groupFilesDir = path.join(groupsDir, groupId, 'files');
    if (!filepath.startsWith(groupFilesDir)) {
        return res.status(403).json({ error: '접근이 금지되었습니다.' });
    }

    const fileType = getFileType(filename);

    if (fileType === 'image') {
        // 이미지 파일인 경우 바이너리로 서빙
        const mimeType = mime.lookup(filename) || 'application/octet-stream';

        fs.readFile(filepath, (err, data) => {
            if (err) {
                if (err.code === 'ENOENT') {
                    return res.status(404).json({ error: '파일을 찾을 수 없습니다.' });
                }
                return res.status(500).json({ error: '파일을 읽을 수 없습니다.' });
            }

            res.set('Content-Type', mimeType);
            res.send(data);
        });
    } else {
        // 마크다운 파일인 경우 텍스트로 반환
        fs.readFile(filepath, 'utf8', (err, content) => {
            if (err) {
                if (err.code === 'ENOENT') {
                    return res.status(404).json({ error: '파일을 찾을 수 없습니다.' });
                }
                return res.status(500).json({ error: '파일을 읽을 수 없습니다.' });
            }

            res.json({
                filename: filename,
                displayName: filename.replace(/^\d+-/, ''),
                content: content,
                fileType: fileType
            });
        });
    }
});

// 라우트: 그룹 썸네일 서빙
app.get('/api/groups/:groupId/thumbnails/:filename', (req, res) => {
    const groupId = req.params.groupId;
    const filename = req.params.filename;
    const filepath = path.join(groupsDir, groupId, 'thumbnails', filename);

    // 보안을 위해 경로 검증
    const groupThumbnailsDir = path.join(groupsDir, groupId, 'thumbnails');
    if (!filepath.startsWith(groupThumbnailsDir)) {
        return res.status(403).json({ error: '접근이 금지되었습니다.' });
    }

    res.sendFile(filepath, (err) => {
        if (err) {
            res.status(404).json({ error: '썸네일을 찾을 수 없습니다.' });
        }
    });
});

// 라우트: 클립보드 이미지 업로드
app.post('/api/upload-clipboard', async (req, res) => {
    try {
        const { imageData } = req.body;

        if (!imageData) {
            return res.status(400).json({ error: '이미지 데이터가 없습니다.' });
        }

        // Base64 데이터에서 헤더 제거
        const base64Data = imageData.replace(/^data:image\/\w+;base64,/, '');
        const buffer = Buffer.from(base64Data, 'base64');

        // 파일명 생성
        const timestamp = Date.now();
        const filename = `${timestamp}-clipboard.png`;
        const filepath = path.join(imagesDir, filename);

        // 이미지 파일 저장
        await fs.promises.writeFile(filepath, buffer);

        // 썸네일 생성
        const thumbnailName = filename.replace('.png', '.jpg');
        const thumbnailPath = path.join(thumbnailsDir, thumbnailName);
        await generateThumbnail(filepath, thumbnailPath);

        res.json({
            message: '클립보드 이미지가 성공적으로 업로드되었습니다.',
            filename: filename,
            originalName: 'clipboard.png',
            fileType: 'image'
        });
    } catch (error) {
        console.error('클립보드 이미지 업로드 오류:', error);
        res.status(500).json({ error: '이미지 업로드 중 오류가 발생했습니다.' });
    }
});

// 라우트: 파일 삭제
app.delete('/api/files/:folder/:filename', async (req, res) => {
    try {
        const folder = req.params.folder;
        const filename = req.params.filename;
        const filepath = path.join(uploadsDir, folder, filename);

        // 보안을 위해 경로 검증
        if (!filepath.startsWith(uploadsDir)) {
            return res.status(403).json({ error: '접근이 금지되었습니다.' });
        }

        // 메인 파일 삭제
        await fs.promises.unlink(filepath);

        // 이미지 파일인 경우 썸네일도 삭제
        if (folder === 'images') {
            const thumbnailName = filename.replace(/\.[^/.]+$/, '.jpg');
            const thumbnailPath = path.join(thumbnailsDir, thumbnailName);

            try {
                await fs.promises.unlink(thumbnailPath);
            } catch (err) {
                // 썸네일이 없어도 무시
                console.log('썸네일 삭제 실패 (무시):', err.message);
            }
        }

        res.json({ message: '파일이 성공적으로 삭제되었습니다.' });
    } catch (error) {
        console.error('파일 삭제 오류:', error);
        if (error.code === 'ENOENT') {
            return res.status(404).json({ error: '파일을 찾을 수 없습니다.' });
        }
        res.status(500).json({ error: '파일을 삭제할 수 없습니다.' });
    }
});

// 라우트: 그룹에 파일 추가
app.post('/api/groups/:groupId/files', upload.array('files'), async (req, res) => {
    try {
        const groupId = req.params.groupId;
        const files = req.files;

        if (!files || files.length === 0) {
            return res.status(400).json({ error: '파일이 없습니다.' });
        }

        const groupDir = path.join(groupsDir, groupId);
        const groupFilesDir = path.join(groupDir, 'files');
        const groupThumbnailsDir = path.join(groupDir, 'thumbnails');

        if (!fs.existsSync(groupDir)) {
            return res.status(404).json({ error: '그룹을 찾을 수 없습니다.' });
        }

        const metadata = await readGroupMetadata(groupId);
        if (!metadata) {
            return res.status(404).json({ error: '그룹 메타데이터를 찾을 수 없습니다.' });
        }

        for (const file of files) {
            const timestamp = Date.now();
            const randomSuffix = Math.random().toString(36).substring(2, 8);
            const filename = `${timestamp}-${randomSuffix}-${file.originalname}`;
            const filepath = path.join(groupFilesDir, filename);

            // 파일 저장
            await fs.promises.rename(file.path, filepath);

            // 파일 타입 결정
            let fileType = 'file';
            if (file.mimetype.startsWith('image/')) {
                fileType = 'image';
                // 썸네일 생성
                const thumbnailName = filename.replace(/\.[^/.]+$/, '.jpg');
                const thumbnailPath = path.join(groupThumbnailsDir, thumbnailName);

                try {
                    await sharp(filepath)
                        .resize(300, 200, {
                            fit: 'inside',
                            withoutEnlargement: true
                        })
                        .jpeg({ quality: 80 })
                        .toFile(thumbnailPath);
                } catch (thumbError) {
                    console.error('썸네일 생성 실패:', thumbError);
                }
            } else if (file.mimetype === 'text/markdown' ||
                       file.originalname.endsWith('.md') ||
                       file.originalname.endsWith('.markdown')) {
                fileType = 'markdown';
            }

            // 한글 파일명 인코딩 처리
            const displayName = Buffer.from(file.originalname, 'latin1').toString('utf8');

            // 메타데이터에 파일 추가
            metadata.files.push({
                filename,
                displayName: displayName,
                fileType,
                uploadDate: new Date().toISOString(),
                size: file.size
            });
        }

        await saveGroupMetadata(groupId, metadata);

        res.json({
            message: `${files.length}개 파일이 추가되었습니다.`,
            group: metadata
        });
    } catch (error) {
        console.error('그룹 파일 추가 오류:', error);
        res.status(500).json({ error: '파일 추가에 실패했습니다.' });
    }
});

// 라우트: 그룹에서 파일 삭제
app.delete('/api/groups/:groupId/files/:filename', async (req, res) => {
    try {
        const { groupId, filename } = req.params;

        const groupDir = path.join(groupsDir, groupId);
        const groupFilesDir = path.join(groupDir, 'files');
        const groupThumbnailsDir = path.join(groupDir, 'thumbnails');

        if (!fs.existsSync(groupDir)) {
            return res.status(404).json({ error: '그룹을 찾을 수 없습니다.' });
        }

        const metadata = await readGroupMetadata(groupId);
        if (!metadata) {
            return res.status(404).json({ error: '그룹 메타데이터를 찾을 수 없습니다.' });
        }

        // 메타데이터에서 파일 찾기
        const fileIndex = metadata.files.findIndex(f => f.filename === filename);
        if (fileIndex === -1) {
            return res.status(404).json({ error: '파일을 찾을 수 없습니다.' });
        }

        const fileToDelete = metadata.files[fileIndex];

        // 실제 파일 삭제
        const filepath = path.join(groupFilesDir, filename);
        if (fs.existsSync(filepath)) {
            await fs.promises.unlink(filepath);
        }

        // 썸네일 삭제 (이미지인 경우)
        if (fileToDelete.fileType === 'image') {
            const thumbnailName = filename.replace(/\.[^/.]+$/, '.jpg');
            const thumbnailPath = path.join(groupThumbnailsDir, thumbnailName);
            if (fs.existsSync(thumbnailPath)) {
                await fs.promises.unlink(thumbnailPath);
            }
        }

        // 메타데이터에서 파일 제거
        metadata.files.splice(fileIndex, 1);
        await saveGroupMetadata(groupId, metadata);

        res.json({
            message: '파일이 삭제되었습니다.',
            group: metadata
        });
    } catch (error) {
        console.error('그룹 파일 삭제 오류:', error);
        res.status(500).json({ error: '파일 삭제에 실패했습니다.' });
    }
});

// 라우트: 그룹 내 파일명 수정
app.put('/api/groups/:groupId/files/:filename/name', async (req, res) => {
    try {
        const { groupId, filename } = req.params;
        const { displayName } = req.body;

        if (!displayName) {
            return res.status(400).json({ error: '파일명이 필요합니다.' });
        }

        const groupDir = path.join(groupsDir, groupId);
        if (!fs.existsSync(groupDir)) {
            return res.status(404).json({ error: '그룹을 찾을 수 없습니다.' });
        }

        const metadata = await readGroupMetadata(groupId);
        if (!metadata) {
            return res.status(404).json({ error: '그룹 메타데이터를 찾을 수 없습니다.' });
        }

        // 메타데이터에서 파일 찾기
        const fileIndex = metadata.files.findIndex(f => f.filename === filename);
        if (fileIndex === -1) {
            return res.status(404).json({ error: '파일을 찾을 수 없습니다.' });
        }

        // 파일명 업데이트
        metadata.files[fileIndex].displayName = displayName.trim();
        await saveGroupMetadata(groupId, metadata);

        res.json({
            message: '파일명이 수정되었습니다.',
            group: metadata
        });
    } catch (error) {
        console.error('파일명 수정 오류:', error);
        res.status(500).json({ error: '파일명 수정에 실패했습니다.' });
    }
});

// 라우트: 그룹 삭제
app.delete('/api/groups/:groupId', async (req, res) => {
    try {
        const groupId = req.params.groupId;
        const groupDir = path.join(groupsDir, groupId);

        if (!fs.existsSync(groupDir)) {
            return res.status(404).json({ error: '그룹을 찾을 수 없습니다.' });
        }

        // 그룹 디렉토리 전체 삭제
        await fs.promises.rm(groupDir, { recursive: true, force: true });

        res.json({
            message: '그룹이 삭제되었습니다.'
        });
    } catch (error) {
        console.error('그룹 삭제 오류:', error);
        res.status(500).json({ error: '그룹 삭제에 실패했습니다.' });
    }
});

// public 폴더 생성
const publicDir = path.join(__dirname, 'public');
if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir);
}

// 서버 시작
app.listen(PORT, '0.0.0.0', () => {
    console.log(`서버가 http://0.0.0.0:${PORT} 에서 실행 중입니다.`);
    console.log('회사 네트워크 내 모든 IP에서 접속 가능합니다.');
});