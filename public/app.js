// 전역 변수
let currentFile = null;
let fileList = [];
let currentGroup = null;
let groupEditMode = false;
let groupFiles = [];

// DOM이 로드되면 실행
document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
});

// 앱 초기화
function initializeApp() {
    // 이벤트 리스너 등록
    setupEventListeners();

    // 사이드바 상태 복원
    initializeSidebar();

    // 전체화면 변경 이벤트 리스너
    document.addEventListener('fullscreenchange', () => {
        isFullscreenMode = !!document.fullscreenElement;
        updateFullscreenButton();
    });

    // 파일 목록 로드 (그룹 목록으로 변경)
    loadGroupList();
}

// 이벤트 리스너 설정
function setupEventListeners() {
    // 파일 업로드
    document.getElementById('fileInput').addEventListener('change', handleFileUpload);

    // 새로고침 버튼
    document.getElementById('refreshBtn').addEventListener('click', loadGroupList);

    // 사이드바 토글 버튼
    document.getElementById('sidebarToggle').addEventListener('click', toggleSidebar);

    // 드래그 앤 드롭 이벤트
    setupDragAndDrop();

    // 클립보드 이벤트
    setupClipboardPaste();
}

// 사이드바 토글
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const sidebarTitle = document.getElementById('sidebarTitle');
    const sidebarToggle = document.getElementById('sidebarToggle');
    const refreshBtn = document.getElementById('refreshBtn');
    const fileList = document.getElementById('fileList');

    const isMinimized = sidebar.classList.contains('minimized');

    if (isMinimized) {
        // 최대화
        sidebar.classList.remove('minimized');
        sidebar.classList.remove('w-16');
        sidebar.classList.add('w-80');
        sidebarTitle.classList.remove('hidden');
        refreshBtn.classList.remove('hidden');
        fileList.classList.remove('hidden');

        // 원래 스타일로 복원
        const buttonContainer = sidebarToggle.parentElement.parentElement;
        buttonContainer.style.justifyContent = 'space-between';

        sidebarToggle.innerHTML = `
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path>
            </svg>
        `;
        sidebarToggle.title = '사이드바 최소화';
    } else {
        // 최소화
        sidebar.classList.add('minimized');
        sidebar.classList.remove('w-80');
        sidebar.classList.add('w-16');
        sidebarTitle.classList.add('hidden');
        refreshBtn.classList.add('hidden');
        fileList.classList.add('hidden');

        // 토글 버튼을 중앙으로 이동
        const buttonContainer = sidebarToggle.parentElement.parentElement;
        buttonContainer.style.justifyContent = 'center';

        sidebarToggle.innerHTML = `
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
            </svg>
        `;
        sidebarToggle.title = '사이드바 최대화';
    }

    // localStorage에 상태 저장
    localStorage.setItem('sidebarMinimized', !isMinimized);
}

// 사이드바 상태 복원
function initializeSidebar() {
    const isMinimized = localStorage.getItem('sidebarMinimized') === 'true';
    if (isMinimized) {
        toggleSidebar();
    }
}

// 파일 업로드 처리
async function handleFileUpload(event) {
    const files = Array.from(event.target.files);
    if (files.length === 0) return;

    // 파일 타입 체크
    for (const file of files) {
        const isMarkdown = file.name.endsWith('.md') || file.name.endsWith('.markdown');
        const isImage = /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(file.name);

        if (!isMarkdown && !isImage) {
            showToast('마크다운 파일(.md, .markdown) 또는 이미지 파일(.jpg, .png, .gif, .webp, .svg)만 업로드 가능합니다.', 'error');
            event.target.value = '';
            return;
        }
    }

    // 새 그룹 시작
    await startNewGroup();

    // 파일들을 그룹에 추가
    for (const file of files) {
        await addFileToCurrentGroup(file);
    }

    event.target.value = '';
}

// 새 그룹 시작
async function startNewGroup() {
    if (groupEditMode && currentGroup) {
        // 이미 그룹 편집 모드면 그대로 사용
        return;
    }

    try {
        showLoading(true);

        const response = await fetch('/api/groups', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                name: `새 그룹 ${new Date().toLocaleDateString('ko-KR')}`
            })
        });

        if (response.ok) {
            const result = await response.json();
            currentGroup = result.group;
            groupFiles = [];
            groupEditMode = true;

            // 그룹 편집 모달 표시
            showGroupEditModal();
        } else {
            const error = await response.json();
            showToast(error.error || '그룹 생성 실패', 'error');
        }
    } catch (error) {
        console.error('Group creation error:', error);
        showToast('그룹 생성 중 오류가 발생했습니다.', 'error');
    } finally {
        showLoading(false);
    }
}

// 현재 그룹에 파일 추가
async function addFileToCurrentGroup(file) {
    console.log('addFileToCurrentGroup called with file:', file.name);
    console.log('currentGroup:', currentGroup);

    if (!currentGroup) {
        showToast('활성 그룹이 없습니다.', 'error');
        return;
    }

    if (!currentGroup.id) {
        console.error('currentGroup.id is missing:', currentGroup);
        showToast('그룹 ID가 없습니다.', 'error');
        return;
    }

    const formData = new FormData();
    formData.append('files', file); // 'file' -> 'files'로 변경하여 서버와 일치시킴

    try {
        showLoading(true);

        console.log('Sending file to:', `/api/groups/${currentGroup.id}/files`);

        const response = await fetch(`/api/groups/${currentGroup.id}/files`, {
            method: 'POST',
            body: formData
        });

        console.log('Response status:', response.status);

        if (response.ok) {
            const result = await response.json();
            console.log('File added successfully:', result);
            currentGroup = result.group;

            // 그룹 파일 목록 업데이트
            updateGroupFilesList();
            showToast('파일이 그룹에 추가되었습니다.', 'success');
        } else {
            const errorData = await response.json().catch(() => ({}));
            console.error('File add failed:', response.status, errorData);
            showToast(errorData.error || `파일 추가 실패 (${response.status})`, 'error');
        }
    } catch (error) {
        console.error('File add error:', error);
        showToast('파일 추가 중 오류가 발생했습니다.', 'error');
    } finally {
        showLoading(false);
    }
}

// 그룹 목록 로드
async function loadGroupList() {
    try {
        // 갤러리 모드 비활성화
        disableGalleryMode();

        const response = await fetch('/api/groups');

        if (!response.ok) {
            throw new Error('그룹 목록을 불러올 수 없습니다.');
        }

        const groups = await response.json();
        renderGroupList(groups);
    } catch (error) {
        console.error('Load groups error:', error);
        showToast('그룹 목록을 불러오는데 실패했습니다.', 'error');
    }
}

// 그룹 목록 렌더링
function renderGroupList(groups) {
    const fileListElement = document.getElementById('fileList');

    if (groups.length === 0) {
        fileListElement.innerHTML = `
            <div class="text-gray-500 text-center py-8">
                완성된 그룹이 없습니다<br>
                <small>파일을 업로드하여 새 그룹을 만드세요</small>
            </div>
        `;
        return;
    }

    fileListElement.innerHTML = groups.map(group => {
        const fileCount = group.files.length;
        const firstImage = group.files.find(f => f.fileType === 'image');
        const thumbnailUrl = group.thumbnail || null;

        return `
        <div class="group-item p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer transition-colors"
             data-group-id="${group.id}">
            <div class="flex justify-between items-start">
                <div class="flex items-center gap-3 flex-1 min-w-0" onclick="viewGroup('${group.id}')">
                    ${thumbnailUrl ?
                        `<img src="${thumbnailUrl}" alt="그룹 썸네일" class="w-12 h-12 rounded object-cover bg-gray-200">` :
                        `<div class="w-12 h-12 flex items-center justify-center text-2xl bg-gray-100 dark:bg-gray-600 rounded">📁</div>`
                    }
                    <div class="flex-1 min-w-0">
                        <h3 class="font-medium text-sm truncate text-gray-900 dark:text-gray-100">
                            ${group.name}
                        </h3>
                        <div class="flex items-center gap-2 mt-1">
                            <span class="text-xs text-green-600 dark:text-green-400 px-2 py-0.5 bg-green-100 dark:bg-green-900/30 rounded">
                                ${fileCount}개 파일
                            </span>
                            <span class="text-xs text-gray-500 dark:text-gray-400">
                                ${formatDate(group.completedAt)}
                            </span>
                        </div>
                        <div class="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            ${group.files.map(f => getFileIcon(f.fileType)).join(' ')}
                        </div>
                    </div>
                </div>
                <button onclick="deleteGroup('${group.id}', event)"
                        class="p-1 hover:bg-red-100 dark:hover:bg-red-900/20 rounded transition ml-2">
                    <svg class="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                    </svg>
                </button>
            </div>
        </div>
        `;
    }).join('');
}

// 파일 타입별 아이콘 반환
function getFileIcon(fileType) {
    switch(fileType) {
        case 'markdown': return '📄';
        case 'image': return '🖼️';
        default: return '📄';
    }
}

// 파일 로드
async function loadFile(folder, filename) {
    showLoading(true);
    currentFile = filename;

    try {
        if (folder === 'images') {
            // 이미지 파일인 경우
            const imageUrl = `/api/files/${folder}/${filename}`;
            renderImage(imageUrl, filename);
        } else {
            // 마크다운 파일인 경우
            const response = await fetch(`/api/files/${folder}/${filename}`);

            if (!response.ok) {
                throw new Error('파일을 불러올 수 없습니다.');
            }

            const file = await response.json();
            renderMarkdown(file.content);
        }

        // 파일 목록 업데이트 (선택 표시)
        updateFileSelection(filename);

    } catch (error) {
        console.error('Load file error:', error);
        showToast('파일을 불러오는데 실패했습니다.', 'error');
    } finally {
        showLoading(false);
    }
}

// 마크다운 렌더링
function renderMarkdown(content) {
    const welcomeScreen = document.getElementById('welcomeScreen');
    const markdownContent = document.getElementById('markdownContent');

    // 갤러리 모드 비활성화
    disableGalleryMode();

    // marked.js 옵션 설정
    marked.setOptions({
        breaks: true,
        gfm: true,
        headerIds: true,
        tables: true,
        highlight: function(code, lang) {
            // 코드 하이라이팅 (간단한 처리)
            return code;
        }
    });

    // 마크다운 파싱 및 렌더링
    const html = marked.parse(content);

    // 화면 전환
    welcomeScreen.classList.add('hidden');
    markdownContent.classList.remove('hidden');
    markdownContent.innerHTML = html;

    // 렌더링된 내용의 모든 링크를 새 탭에서 열도록 설정
    markdownContent.querySelectorAll('a').forEach(link => {
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
    });
}

// 갤러리 관련 전역 변수
let currentImageIndex = -1;
let galleryImages = [];
let isGalleryMode = false;
let isFullscreenMode = false;

// 이미지 렌더링 (갤러리 모드 지원)
function renderImage(imageUrl, filename) {
    const welcomeScreen = document.getElementById('welcomeScreen');
    const markdownContent = document.getElementById('markdownContent');

    // 화면 전환
    welcomeScreen.classList.add('hidden');
    markdownContent.classList.remove('hidden');

    // 현재 그룹의 이미지들 확인
    checkGalleryMode(filename);

    // 갤러리 네비게이션 버튼
    const galleryNav = isGalleryMode && galleryImages.length > 1 ? `
        <div class="flex items-center gap-2">
            <button onclick="previousImage()"
                    class="p-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-600 dark:hover:bg-gray-500 rounded transition"
                    title="이전 이미지 (←)"
                    ${currentImageIndex === 0 ? 'disabled opacity-50' : ''}>
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path>
                </svg>
            </button>
            <span class="text-sm text-gray-600 dark:text-gray-400 min-w-[4rem] text-center">
                ${currentImageIndex + 1} / ${galleryImages.length}
            </span>
            <button onclick="nextImage()"
                    class="p-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-600 dark:hover:bg-gray-500 rounded transition"
                    title="다음 이미지 (→)"
                    ${currentImageIndex === galleryImages.length - 1 ? 'disabled opacity-50' : ''}>
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
                </svg>
            </button>
        </div>
    ` : '';

    // 이미지 뷰어 HTML
    markdownContent.innerHTML = `
        <div class="image-viewer">
            <div class="flex justify-between items-center mb-4">
                <h2 class="text-xl font-semibold">${filename.replace(/^\d+-/, '')}</h2>
                <div class="flex gap-4 items-center">
                    ${galleryNav}
                    <div class="flex gap-2">
                        <button onclick="downloadImage('${imageUrl}', '${filename}')"
                                class="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 transition text-sm">
                            다운로드
                        </button>
                        <button onclick="toggleFullscreen()"
                                class="px-3 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 transition text-sm flex items-center gap-2">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"></path>
                            </svg>
                            전체화면
                        </button>
                    </div>
                </div>
            </div>
            <div class="image-container bg-gray-100 dark:bg-gray-800 rounded-lg p-4 flex justify-center relative">
                <img id="viewerImage" src="${imageUrl}" alt="${filename}"
                     class="max-w-full max-h-screen object-contain cursor-zoom-in"
                     onclick="toggleZoom(this)">
                ${isGalleryMode && galleryImages.length > 1 ? `
                    <!-- 좌측 네비게이션 -->
                    <button onclick="previousImage()"
                            class="absolute left-4 top-1/2 transform -translate-y-1/2 p-3 bg-black bg-opacity-50 text-white rounded-full hover:bg-opacity-70 transition ${currentImageIndex === 0 ? 'opacity-25 cursor-not-allowed' : ''}"
                            ${currentImageIndex === 0 ? 'disabled' : ''}>
                        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path>
                        </svg>
                    </button>
                    <!-- 우측 네비게이션 -->
                    <button onclick="nextImage()"
                            class="absolute right-4 top-1/2 transform -translate-y-1/2 p-3 bg-black bg-opacity-50 text-white rounded-full hover:bg-opacity-70 transition ${currentImageIndex === galleryImages.length - 1 ? 'opacity-25 cursor-not-allowed' : ''}"
                            ${currentImageIndex === galleryImages.length - 1 ? 'disabled' : ''}>
                        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
                        </svg>
                    </button>
                ` : ''}
            </div>
        </div>
    `;

    // 키보드 네비게이션 활성화
    if (isGalleryMode) {
        enableKeyboardNavigation();
    }
}

// 파일 선택 업데이트
function updateFileSelection(filename) {
    document.querySelectorAll('.file-item').forEach(item => {
        if (item.dataset.filename === filename) {
            item.classList.add('bg-blue-50', 'dark:bg-blue-900/20');
        } else {
            item.classList.remove('bg-blue-50', 'dark:bg-blue-900/20');
        }
    });
}

// 이미지 다운로드
function downloadImage(imageUrl, filename) {
    const link = document.createElement('a');
    link.href = imageUrl;
    link.download = filename.replace(/^\d+-/, '');
    link.click();
}

// 이미지 확대/축소 토글
function toggleZoom(img) {
    if (img.style.transform === 'scale(2)') {
        img.style.transform = 'scale(1)';
        img.style.cursor = 'zoom-in';
    } else {
        img.style.transform = 'scale(2)';
        img.style.cursor = 'zoom-out';
    }
}

// 전체화면 토글
function toggleFullscreen() {
    const imageContainer = document.querySelector('.image-container');
    if (!document.fullscreenElement) {
        imageContainer.requestFullscreen()
            .then(() => {
                isFullscreenMode = true;
                updateFullscreenButton();
            })
            .catch(console.error);
    } else {
        document.exitFullscreen()
            .then(() => {
                isFullscreenMode = false;
                updateFullscreenButton();
            })
            .catch(console.error);
    }
}

// 전체화면 버튼 상태 업데이트
function updateFullscreenButton() {
    const fullscreenButton = document.querySelector('button[onclick="toggleFullscreen()"]');
    if (!fullscreenButton) return;

    if (document.fullscreenElement) {
        // 전체화면 모드 - 축소 아이콘
        fullscreenButton.innerHTML = `
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 9V4.5M9 9H4.5M9 9L3.5 3.5M15 9V4.5M15 9h4.5M15 9l5.5-5.5M9 15v4.5M9 15H4.5M9 15l-5.5 5.5M15 15v4.5M15 15h4.5M15 15l5.5 5.5"></path>
            </svg>
            축소
        `;
    } else {
        // 일반 모드 - 확장 아이콘
        fullscreenButton.innerHTML = `
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"></path>
            </svg>
            전체화면
        `;
    }
}

// 전체화면 상태 유지
function maintainFullscreen() {
    if (isFullscreenMode && !document.fullscreenElement) {
        const imageContainer = document.querySelector('.image-container');
        if (imageContainer) {
            setTimeout(() => {
                imageContainer.requestFullscreen().catch(console.error);
            }, 100);
        }
    }
}

// 클립보드 붙여넣기 설정
function setupClipboardPaste() {
    document.addEventListener('paste', async (e) => {
        const items = e.clipboardData.items;

        for (let item of items) {
            if (item.type.indexOf('image') !== -1) {
                e.preventDefault();

                const file = item.getAsFile();
                const reader = new FileReader();

                reader.onload = async (event) => {
                    const imageData = event.target.result;

                    // 그룹 모드가 아니면 새 그룹 시작
                    if (!groupEditMode) {
                        await startNewGroup();
                    }

                    // 현재 그룹에 이미지 추가 (서버 저장)
                    if (currentGroup) {
                        // Base64를 Blob으로 변환
                        const byteString = atob(imageData.split(',')[1]);
                        const mimeString = imageData.split(',')[0].split(':')[1].split(';')[0];
                        const ab = new ArrayBuffer(byteString.length);
                        const ia = new Uint8Array(ab);
                        for (let i = 0; i < byteString.length; i++) {
                            ia[i] = byteString.charCodeAt(i);
                        }
                        const blob = new Blob([ab], {type: mimeString});
                        const file = new File([blob], 'clipboard.png', {type: mimeString});

                        await addFileToCurrentGroup(file);
                    }
                };

                reader.readAsDataURL(file);
                break;
            }
        }
    });
}

// 파일 삭제
async function deleteFile(folder, filename, event) {
    event.stopPropagation();

    if (!confirm(`"${filename.replace(/^\d+-/, '')}" 파일을 삭제하시겠습니까?`)) {
        return;
    }

    showLoading(true);

    try {
        const response = await fetch(`/api/files/${folder}/${filename}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            showToast('파일이 삭제되었습니다.', 'success');

            // 삭제한 파일이 현재 보고 있는 파일이면 화면 초기화
            if (currentFile === filename) {
                currentFile = null;
                document.getElementById('welcomeScreen').classList.remove('hidden');
                document.getElementById('markdownContent').classList.add('hidden');
            }

            await loadGroupList();
        } else {
            const result = await response.json();
            showToast(result.error || '삭제 실패', 'error');
        }
    } catch (error) {
        console.error('Delete error:', error);
        showToast('삭제 중 오류가 발생했습니다.', 'error');
    } finally {
        showLoading(false);
    }
}

// 로딩 표시
function showLoading(show) {
    const spinner = document.getElementById('loadingSpinner');
    if (show) {
        spinner.classList.remove('hidden');
    } else {
        spinner.classList.add('hidden');
    }
}

// 토스트 메시지
function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toastMessage');

    // 메시지 설정
    toastMessage.textContent = message;

    // 타입별 스타일 설정
    const toastContainer = toast.querySelector('div');
    toastContainer.className = 'px-4 py-3 rounded-lg shadow-lg flex items-center space-x-2';

    switch(type) {
        case 'success':
            toastContainer.className += ' bg-green-600 text-white';
            break;
        case 'error':
            toastContainer.className += ' bg-red-600 text-white';
            break;
        default:
            toastContainer.className += ' bg-gray-800 text-white';
    }

    // 토스트 표시
    toast.classList.remove('hidden');

    // 3초 후 숨기기
    setTimeout(() => {
        toast.classList.add('hidden');
    }, 3000);
}

// 파일 크기 포맷
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

// 날짜 포맷
function formatDate(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now - date);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
        return '오늘';
    } else if (diffDays === 1) {
        return '어제';
    } else if (diffDays < 7) {
        return `${diffDays}일 전`;
    } else {
        return date.toLocaleDateString('ko-KR', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        });
    }
}

// 그룹 편집 모달 표시
function showGroupEditModal() {
    const modal = document.getElementById('groupEditModal');
    const nameInput = document.getElementById('groupNameInput');

    if (currentGroup) {
        nameInput.value = currentGroup.name;
    }

    modal.classList.remove('hidden');
    nameInput.focus();

    // 이벤트 리스너 등록
    setupGroupModalEventListeners();

    // 파일 목록 업데이트
    updateGroupFilesList();
}

// 그룹 모달 이벤트 리스너 설정
function setupGroupModalEventListeners() {
    // 취소 버튼들
    document.getElementById('cancelGroupBtn').onclick = cancelGroupEdit;
    document.getElementById('cancelGroupBtn2').onclick = cancelGroupEdit;

    // 완료 버튼
    document.getElementById('completeGroupBtn').onclick = completeGroup;

    // 그룹 파일 추가
    document.getElementById('groupFileInput').addEventListener('change', handleGroupFileUpload);

    // 그룹명 실시간 업데이트
    document.getElementById('groupNameInput').addEventListener('input', updateGroupName);

    // 모달 외부 클릭시 닫기
    document.getElementById('groupEditModal').onclick = (e) => {
        if (e.target.id === 'groupEditModal') {
            cancelGroupEdit();
        }
    };
}

// 그룹 파일 목록 업데이트
function updateGroupFilesList() {
    const filesList = document.getElementById('groupFilesList');

    if (!filesList) {
        console.error('groupFilesList element not found');
        return;
    }

    if (!currentGroup || !currentGroup.files || currentGroup.files.length === 0) {
        filesList.innerHTML = '<div id="emptyGroupMessage" class="text-center text-gray-500 py-8">파일을 업로드하거나 드래그해서 추가하세요</div>';
        return;
    }

    const filesHtml = currentGroup.files.map(file => {
        const icon = getFileIcon(file.fileType);
        const thumbnailUrl = file.thumbnail ? `/api/groups/${currentGroup.id}/thumbnails/${file.thumbnail}` : null;

        return `
            <div class="flex items-center gap-3 p-2 bg-gray-50 dark:bg-gray-700 rounded">
                ${file.fileType === 'image' && thumbnailUrl ?
                    `<img src="${thumbnailUrl}" alt="썸네일" class="w-8 h-8 rounded object-cover">` :
                    `<div class="text-lg">${icon}</div>`
                }
                <div class="flex-1 min-w-0">
                    <div class="text-sm font-medium truncate">${file.displayName}</div>
                    <div class="text-xs text-gray-500">${file.fileType} • ${formatFileSize(file.size || 0)}</div>
                </div>
                <button onclick="removeFileFromGroup('${file.filename}')"
                        class="text-red-500 hover:text-red-700 p-1">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                    </svg>
                </button>
            </div>
        `;
    }).join('');

    filesList.innerHTML = filesHtml;
}

// 그룹 파일 업로드 처리
async function handleGroupFileUpload(event) {
    const files = Array.from(event.target.files);
    if (files.length === 0 || !currentGroup) return;

    for (const file of files) {
        await addFileToCurrentGroup(file);
    }

    event.target.value = '';
}

// 그룹명 실시간 업데이트
async function updateGroupName() {
    const nameInput = document.getElementById('groupNameInput');
    const newName = nameInput.value.trim();

    if (!newName || !currentGroup) return;

    // 그룹이 완료된 상태인지 확인
    if (currentGroup.isCompleted) {
        // 완료된 그룹만 서버에 실시간 업데이트
        try {
            const response = await fetch(`/api/groups/${currentGroup.id}/name`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ name: newName })
            });

            if (response.ok) {
                const result = await response.json();
                currentGroup = result.group;
            } else {
                console.error('Group name update failed:', response.status);
            }
        } catch (error) {
            console.error('Group name update error:', error);
        }
    } else {
        // 편집 중인 그룹은 로컬에서만 이름 업데이트
        currentGroup.name = newName;
    }
}

// 그룹 완료
async function completeGroup() {
    if (!currentGroup) return;

    if (currentGroup.files.length === 0) {
        showToast('파일을 하나 이상 추가해주세요.', 'error');
        return;
    }

    try {
        showLoading(true);

        const nameInput = document.getElementById('groupNameInput');
        const finalName = nameInput.value.trim() || currentGroup.name;

        const response = await fetch(`/api/groups/${currentGroup.id}/complete`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ name: finalName })
        });

        if (response.ok) {
            showToast('그룹이 완성되었습니다!', 'success');
            closeGroupEditModal();
            await loadGroupList();
        } else {
            const error = await response.json();
            showToast(error.error || '그룹 완성 실패', 'error');
        }
    } catch (error) {
        console.error('Group complete error:', error);
        showToast('그룹 완성 중 오류가 발생했습니다.', 'error');
    } finally {
        showLoading(false);
    }
}

// 그룹 편집 취소
function cancelGroupEdit() {
    if (confirm('편집을 취소하시겠습니까? 업로드된 파일들은 삭제됩니다.')) {
        closeGroupEditModal();
        // TODO: 서버에서 미완성 그룹 삭제 API 호출
    }
}

// 그룹 편집 모달 닫기
function closeGroupEditModal() {
    document.getElementById('groupEditModal').classList.add('hidden');
    currentGroup = null;
    groupFiles = [];
    groupEditMode = false;
}

// 그룹 보기
async function viewGroup(groupId) {
    try {
        showLoading(true);

        const response = await fetch(`/api/groups/${groupId}`);
        if (!response.ok) {
            throw new Error('그룹을 불러올 수 없습니다.');
        }

        const group = await response.json();
        currentGroup = group;
        currentGroup.id = groupId;

        // 사이드바에 그룹 파일 목록 표시
        displayGroupFiles(group);

        // 첫 번째 파일을 자동으로 로드
        if (group.files.length > 0) {
            await viewGroupFile(groupId, group.files[0].filename);
        }

        showToast(`"${group.name}" 그룹을 불러왔습니다.`, 'success');
    } catch (error) {
        console.error('View group error:', error);
        showToast('그룹을 불러오는데 실패했습니다.', 'error');
    } finally {
        showLoading(false);
    }
}

// 그룹 파일 목록을 사이드바에 표시
function displayGroupFiles(group) {
    const fileList = document.getElementById('fileList');
    const groupId = currentGroup.id;

    fileList.innerHTML = `
        <div class="mb-4">
            <div class="flex items-center justify-between mb-2">
                <h3 class="font-semibold text-gray-800 dark:text-gray-200">${group.name}</h3>
                <button onclick="loadGroupList()"
                        class="text-sm text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300">
                    ← 목록으로
                </button>
            </div>
            <div class="text-sm text-gray-500 dark:text-gray-400 mb-3">
                총 ${group.files.length}개 파일
            </div>
            <div class="flex gap-2 mb-3">
                <label for="groupFileAdd" class="px-3 py-1 bg-blue-500 text-white rounded text-sm hover:bg-blue-600 cursor-pointer transition">
                    + 파일 추가
                </label>
                <input type="file" id="groupFileAdd" multiple accept=".md,.markdown,.jpg,.jpeg,.png,.gif,.webp,.svg" class="hidden">
            </div>
        </div>
        <div class="space-y-2">
            ${group.files.map(file => `
                <div class="file-item p-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer transition"
                     data-filename="${file.filename}"
                     onclick="viewGroupFile('${groupId}', '${file.filename}')">
                    <div class="flex items-center gap-2">
                        <span class="text-lg">
                            ${file.fileType === 'markdown' ? '📄' :
                              file.fileType === 'image' ? '🖼️' : '📁'}
                        </span>
                        <div class="flex-1 min-w-0">
                            <div class="font-medium text-gray-800 dark:text-gray-200 truncate">
                                <span class="file-name" data-filename="${file.filename}"
                                      ondblclick="editFileName('${groupId}', '${file.filename}', event)"
                                      title="더블클릭으로 파일명 편집">
                                    ${file.displayName}
                                </span>
                            </div>
                            <div class="text-xs text-gray-500 dark:text-gray-400">
                                ${file.fileType === 'markdown' ? 'Markdown' :
                                  file.fileType === 'image' ? 'Image' : 'File'}
                            </div>
                        </div>
                        <div class="flex gap-1">
                            <button onclick="editFileName('${groupId}', '${file.filename}', event)"
                                    class="p-1 text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 transition"
                                    title="파일명 편집">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path>
                                </svg>
                            </button>
                            <button onclick="deleteGroupFile('${groupId}', '${file.filename}', event)"
                                    class="p-1 text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 transition"
                                    title="파일 삭제">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                                </svg>
                            </button>
                        </div>
                    </div>
                </div>
            `).join('')}
        </div>
    `;

    // 파일 추가 이벤트 리스너
    const fileAddInput = document.getElementById('groupFileAdd');
    if (fileAddInput) {
        fileAddInput.addEventListener('change', async (e) => {
            if (e.target.files.length > 0) {
                await addFilesToGroup(groupId, e.target.files);
                e.target.value = ''; // 입력 초기화
            }
        });
    }
}

// 그룹 내 특정 파일 보기
async function viewGroupFile(groupId, filename) {
    try {
        if (!currentGroup) return;

        const file = currentGroup.files.find(f => f.filename === filename);
        if (!file) return;

        // 파일 선택 상태 업데이트
        updateFileSelection(filename);

        if (file.fileType === 'image') {
            const imageUrl = `/api/groups/${groupId}/files/${filename}`;

            // 갤러리 모드가 활성화되어 있고 이미 이미지 뷰어가 있다면 DOM 재생성 없이 업데이트
            if (isGalleryMode && document.getElementById('viewerImage')) {
                // 현재 이미지 인덱스 업데이트
                currentImageIndex = galleryImages.findIndex(img => img.displayName === file.displayName);
                if (currentImageIndex === -1) currentImageIndex = 0;

                updateGalleryImage(imageUrl, file.displayName);
            } else {
                renderImage(imageUrl, file.displayName);
            }
        } else if (file.fileType === 'markdown') {
            const fileResponse = await fetch(`/api/groups/${groupId}/files/${filename}`);
            if (fileResponse.ok) {
                const fileData = await fileResponse.json();
                renderMarkdown(fileData.content);
            }
        }
    } catch (error) {
        console.error('View group file error:', error);
        showToast('파일을 불러오는데 실패했습니다.', 'error');
    }
}

// 갤러리 모드 확인
function checkGalleryMode(currentDisplayName) {
    if (!currentGroup || !currentGroup.files) {
        isGalleryMode = false;
        galleryImages = [];
        currentImageIndex = -1;
        return;
    }

    // 현재 그룹의 모든 파일이 이미지인지 확인
    const imageFiles = currentGroup.files.filter(file => file.fileType === 'image');

    // 이미지 파일이 2개 이상일 때 갤러리 모드
    isGalleryMode = imageFiles.length >= 2;

    if (isGalleryMode) {
        galleryImages = imageFiles;
        // displayName으로 매칭
        currentImageIndex = galleryImages.findIndex(img => img.displayName === currentDisplayName);

        // 매칭 실패시 첫 번째 이미지로 설정
        if (currentImageIndex === -1) {
            currentImageIndex = 0;
        }
    } else {
        galleryImages = [];
        currentImageIndex = -1;
    }
}

// 이전 이미지로 이동
function previousImage() {
    if (!isGalleryMode || currentImageIndex <= 0) return;

    currentImageIndex--;
    const prevImage = galleryImages[currentImageIndex];
    const imageUrl = `/api/groups/${currentGroup.id}/files/${prevImage.filename}`;

    // 사이드바에서 선택 상태 업데이트
    updateFileSelection(prevImage.filename);

    // 갤러리 모드에서는 이미지만 교체 (DOM 재생성 방지)
    updateGalleryImage(imageUrl, prevImage.displayName);
}

// 다음 이미지로 이동
function nextImage() {
    if (!isGalleryMode || currentImageIndex >= galleryImages.length - 1) return;

    currentImageIndex++;
    const nextImage = galleryImages[currentImageIndex];
    const imageUrl = `/api/groups/${currentGroup.id}/files/${nextImage.filename}`;

    // 사이드바에서 선택 상태 업데이트
    updateFileSelection(nextImage.filename);

    // 갤러리 모드에서는 이미지만 교체 (DOM 재생성 방지)
    updateGalleryImage(imageUrl, nextImage.displayName);
}

// 갤러리 이미지 업데이트 (DOM 재생성 없이)
function updateGalleryImage(imageUrl, displayName) {
    // 이미지 요소만 업데이트
    const viewerImage = document.getElementById('viewerImage');
    if (viewerImage) {
        viewerImage.src = imageUrl;
        viewerImage.alt = displayName;
    }

    // 제목 업데이트
    const titleElement = document.querySelector('.image-viewer h2');
    if (titleElement) {
        titleElement.textContent = displayName.replace(/^\d+-/, '');
    }

    // 다운로드 버튼 업데이트
    const downloadBtn = document.querySelector('.image-viewer button[onclick*="downloadImage"]');
    if (downloadBtn) {
        downloadBtn.setAttribute('onclick', `downloadImage('${imageUrl}', '${displayName}')`);
    }

    // 전체화면 버튼 상태 업데이트
    updateFullscreenButton();

    // 갤러리 정보 업데이트 (현재 위치)
    const galleryInfo = document.querySelector('.image-viewer .text-sm.text-gray-600');
    if (galleryInfo) {
        galleryInfo.textContent = `${currentImageIndex + 1} / ${galleryImages.length}`;
    }

    // 네비게이션 버튼 상태 업데이트
    updateNavigationButtons();
}

// 네비게이션 버튼 상태 업데이트
function updateNavigationButtons() {
    // 이전 버튼들
    const prevButtons = document.querySelectorAll('button[onclick="previousImage()"]');
    prevButtons.forEach(btn => {
        if (currentImageIndex === 0) {
            btn.disabled = true;
            btn.classList.add('opacity-50', 'cursor-not-allowed');
            btn.classList.remove('hover:bg-gray-300', 'dark:hover:bg-gray-500', 'hover:bg-opacity-70');
        } else {
            btn.disabled = false;
            btn.classList.remove('opacity-50', 'cursor-not-allowed');
            btn.classList.add('hover:bg-gray-300', 'dark:hover:bg-gray-500', 'hover:bg-opacity-70');
        }
    });

    // 다음 버튼들
    const nextButtons = document.querySelectorAll('button[onclick="nextImage()"]');
    nextButtons.forEach(btn => {
        if (currentImageIndex === galleryImages.length - 1) {
            btn.disabled = true;
            btn.classList.add('opacity-50', 'cursor-not-allowed');
            btn.classList.remove('hover:bg-gray-300', 'dark:hover:bg-gray-500', 'hover:bg-opacity-70');
        } else {
            btn.disabled = false;
            btn.classList.remove('opacity-50', 'cursor-not-allowed');
            btn.classList.add('hover:bg-gray-300', 'dark:hover:bg-gray-500', 'hover:bg-opacity-70');
        }
    });
}

// 키보드 네비게이션 활성화
function enableKeyboardNavigation() {
    // 기존 이벤트 리스너 제거
    document.removeEventListener('keydown', galleryKeyHandler);
    // 새 이벤트 리스너 추가
    document.addEventListener('keydown', galleryKeyHandler);
}

// 갤러리 키보드 핸들러
function galleryKeyHandler(event) {
    if (!isGalleryMode) return;

    switch(event.key) {
        case 'ArrowLeft':
            event.preventDefault();
            previousImage();
            break;
        case 'ArrowRight':
            event.preventDefault();
            nextImage();
            break;
        case 'Escape':
            event.preventDefault();
            // 갤러리 모드 종료 (필요시)
            break;
    }
}

// 갤러리 모드 비활성화
function disableGalleryMode() {
    isGalleryMode = false;
    galleryImages = [];
    currentImageIndex = -1;
    // 키보드 이벤트 리스너 제거
    document.removeEventListener('keydown', galleryKeyHandler);

    // 전체화면 종료
    if (document.fullscreenElement) {
        document.exitFullscreen()
            .then(() => {
                isFullscreenMode = false;
            })
            .catch(console.error);
    }
}

// 그룹에 파일 추가
async function addFilesToGroup(groupId, files) {
    try {
        showLoading(true);

        const formData = new FormData();
        // 각 파일을 'files' 키로 추가 (multer.array('files')와 호환)
        for (let i = 0; i < files.length; i++) {
            formData.append('files', files[i]);
        }

        const response = await fetch(`/api/groups/${groupId}/files`, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || '파일 추가에 실패했습니다.');
        }

        // 그룹 정보 새로고침
        await viewGroup(groupId);
        showToast(`${files.length}개 파일이 추가되었습니다.`, 'success');
    } catch (error) {
        console.error('Add files to group error:', error);
        showToast(error.message || '파일 추가에 실패했습니다.', 'error');
    } finally {
        showLoading(false);
    }
}

// 그룹에서 파일 삭제
async function deleteGroupFile(groupId, filename, event) {
    event.stopPropagation();

    if (!confirm('이 파일을 삭제하시겠습니까?')) {
        return;
    }

    try {
        showLoading(true);

        const response = await fetch(`/api/groups/${groupId}/files/${filename}`, {
            method: 'DELETE'
        });

        if (!response.ok) {
            throw new Error('파일 삭제에 실패했습니다.');
        }

        // 그룹 정보 새로고침
        await viewGroup(groupId);
        showToast('파일이 삭제되었습니다.', 'success');
    } catch (error) {
        console.error('Delete group file error:', error);
        showToast('파일 삭제에 실패했습니다.', 'error');
    } finally {
        showLoading(false);
    }
}

// 파일명 편집
async function editFileName(groupId, filename, event) {
    event.stopPropagation();

    if (!currentGroup) return;

    const file = currentGroup.files.find(f => f.filename === filename);
    if (!file) return;

    const newDisplayName = prompt('새 파일명을 입력하세요:', file.displayName);
    if (!newDisplayName || newDisplayName === file.displayName) {
        return;
    }

    try {
        showLoading(true);

        const response = await fetch(`/api/groups/${groupId}/files/${filename}/name`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ displayName: newDisplayName })
        });

        if (response.ok) {
            const result = await response.json();
            currentGroup = result.group;

            // 파일 목록 새로고침
            displayGroupFiles(currentGroup);
            showToast('파일명이 수정되었습니다.', 'success');
        } else {
            const errorData = await response.json().catch(() => ({}));
            showToast(errorData.error || `파일명 수정 실패 (${response.status})`, 'error');
        }
    } catch (error) {
        console.error('File name edit error:', error);
        showToast('파일명 수정 중 오류가 발생했습니다.', 'error');
    } finally {
        showLoading(false);
    }
}

// 그룹 삭제
async function deleteGroup(groupId, event) {
    event.stopPropagation();

    if (!confirm('이 그룹을 삭제하시겠습니까? 모든 파일이 함께 삭제됩니다.')) {
        return;
    }

    try {
        showLoading(true);

        const response = await fetch(`/api/groups/${groupId}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            showToast('그룹이 삭제되었습니다.', 'success');
            await loadGroupList();
        } else {
            let errorMessage = `삭제 실패 (${response.status})`;
            try {
                const error = await response.json();
                errorMessage = error.error || errorMessage;
            } catch (parseError) {
                // HTML 응답인 경우 JSON 파싱이 실패할 수 있음
                console.error('Error parsing JSON:', parseError);
            }
            showToast(errorMessage, 'error');
        }
    } catch (error) {
        console.error('Delete group error:', error);
        showToast('그룹 삭제 중 오류가 발생했습니다.', 'error');
    } finally {
        showLoading(false);
    }
}

// 드래그 앤 드롭 설정
function setupDragAndDrop() {
    const dropArea = document.body;

    // 드래그 오버 방지
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropArea.addEventListener(eventName, preventDefaults, false);
        document.body.addEventListener(eventName, preventDefaults, false);
    });

    // 드래그 오버 하이라이트
    ['dragenter', 'dragover'].forEach(eventName => {
        dropArea.addEventListener(eventName, highlight, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropArea.addEventListener(eventName, unhighlight, false);
    });

    // 드롭 처리
    dropArea.addEventListener('drop', handleDrop, false);
}

function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
}

function highlight(e) {
    document.body.classList.add('drag-over');
}

function unhighlight(e) {
    document.body.classList.remove('drag-over');
}

function handleDrop(e) {
    const dt = e.dataTransfer;
    const files = dt.files;

    handleFiles(files);
}

function handleFiles(files) {
    const file = files[0];
    if (!file) return;

    // 파일 타입 체크
    const isMarkdown = file.name.endsWith('.md') || file.name.endsWith('.markdown');
    const isImage = /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(file.name);

    if (!isMarkdown && !isImage) {
        showToast('마크다운 파일(.md, .markdown) 또는 이미지 파일(.jpg, .png, .gif, .webp, .svg)만 업로드 가능합니다.', 'error');
        return;
    }

    // FormData 생성
    const formData = new FormData();
    formData.append('file', file);

    // 로딩 표시
    showLoading(true);

    fetch('/api/upload', {
        method: 'POST',
        body: formData
    })
    .then(response => response.json())
    .then(result => {
        if (result.error) {
            showToast(result.error, 'error');
        } else {
            showToast('파일이 성공적으로 업로드되었습니다.', 'success');
            loadFileList().then(() => {
                if (result.filename && result.fileType) {
                    const folder = result.fileType === 'image' ? 'images' : 'markdown';
                    loadFile(folder, result.filename);
                }
            });
        }
    })
    .catch(error => {
        console.error('Upload error:', error);
        showToast('업로드 중 오류가 발생했습니다.', 'error');
    })
    .finally(() => {
        showLoading(false);
    });
}