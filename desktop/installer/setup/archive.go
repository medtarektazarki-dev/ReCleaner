package main

import (
	"archive/zip"
	"bytes"
	"encoding/binary"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
)

func payload(path string) ([]byte, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	info, err := f.Stat()
	if err != nil {
		return nil, err
	}
	if info.Size() < 16 {
		return nil, fmt.Errorf("installer is incomplete")
	}
	if _, err := f.Seek(-8, io.SeekEnd); err != nil {
		return nil, err
	}
	var off uint64
	if err := binary.Read(f, binary.LittleEndian, &off); err != nil {
		return nil, err
	}
	end := info.Size() - 8
	if off == 0 || int64(off) >= end {
		return nil, fmt.Errorf("installer payload is missing")
	}
	if _, err := f.Seek(int64(off), io.SeekStart); err != nil {
		return nil, err
	}
	return io.ReadAll(io.LimitReader(f, end-int64(off)))
}

func safePath(root, name string) (string, error) {
	if name == "" || strings.Contains(name, "..") || strings.ContainsAny(name, ":") || strings.HasPrefix(name, "/") || strings.HasPrefix(name, "\\") {
		return "", fmt.Errorf("refusing %s", name)
	}
	target := filepath.Join(root, filepath.FromSlash(name))
	// The checks above are a first filter; this confirms where the path actually lands.
	rel, err := filepath.Rel(root, target)
	if err != nil || rel == "." || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
		return "", fmt.Errorf("refusing %s", name)
	}
	return target, nil
}

func extract(data []byte, dest string) error {
	reader, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		return err
	}
	if err := os.MkdirAll(dest, 0o755); err != nil {
		return err
	}
	for _, file := range reader.File {
		target, err := safePath(dest, file.Name)
		if err != nil {
			return err
		}
		if file.FileInfo().IsDir() {
			if err := os.MkdirAll(target, 0o755); err != nil {
				return err
			}
			continue
		}
		if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
			return err
		}
		in, err := file.Open()
		if err != nil {
			return err
		}
		out, err := os.OpenFile(target, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0o755)
		if err != nil {
			in.Close()
			return err
		}
		_, copyErr := io.Copy(out, in)
		in.Close()
		closeErr := out.Close()
		if copyErr != nil {
			return copyErr
		}
		if closeErr != nil {
			return closeErr
		}
	}
	return nil
}
